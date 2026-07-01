import { HoldStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';

export async function decrementAvailableQuantity(
  ticketTypeId: string,
  quantity: number,
  tx: Prisma.TransactionClient,
): Promise<boolean> {
  // Atomic UPDATE with conditional WHERE to prevent overselling.
  // updateMany generates a single UPDATE...WHERE statement; Prisma resolves UUID type
  // from the schema so no manual casting is needed.
  const result = await tx.ticketType.updateMany({
    where: {
      id: ticketTypeId,
      availableQuantity: { gte: quantity },
    },
    data: {
      availableQuantity: { decrement: quantity },
    },
  });
  return result.count === 1;
}

export async function incrementAvailableQuantity(
  ticketTypeId: string,
  quantity: number,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.ticketType.updateMany({
    where: { id: ticketTypeId },
    data: { availableQuantity: { increment: quantity } },
  });
}

export async function createHold(
  data: {
    ticketTypeId: string;
    sessionId: string;
    quantity: number;
    expiresAt: Date;
  },
  tx: Prisma.TransactionClient,
) {
  return tx.ticketHold.create({ data });
}

export async function findHoldById(holdId: string) {
  return prisma.ticketHold.findUnique({
    where: { id: holdId },
    include: { ticketType: true },
  });
}

export async function findActiveHoldBySession(sessionId: string, ticketTypeId: string) {
  return prisma.ticketHold.findFirst({
    where: {
      sessionId,
      ticketTypeId,
      status: HoldStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
  });
}

export async function expireHold(holdId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.ticketHold.update({
    where: { id: holdId },
    data: { status: HoldStatus.EXPIRED, releasedAt: new Date() },
  });
}

// Expire many holds in a single statement. Filtered by status=PENDING so it stays
// idempotent if two cleanup passes ever overlap.
export async function batchExpireHolds(
  holdIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const client = tx ?? prisma;
  const result = await client.ticketHold.updateMany({
    where: { id: { in: holdIds }, status: HoldStatus.PENDING },
    data: { status: HoldStatus.EXPIRED, releasedAt: new Date() },
  });
  return result.count;
}

export async function confirmHold(holdId: string, tx: Prisma.TransactionClient): Promise<number> {
  const result = await tx.ticketHold.updateMany({
    where: { id: holdId, status: HoldStatus.PENDING },
    data: { status: HoldStatus.CONFIRMED, confirmedAt: new Date() },
  });
  return result.count;
}

export async function releaseHold(holdId: string, tx?: Prisma.TransactionClient) {
  const client = tx ?? prisma;
  return client.ticketHold.update({
    where: { id: holdId },
    data: { status: HoldStatus.RELEASED, releasedAt: new Date() },
  });
}

export async function findExpiredPendingHolds() {
  // select only the 4 fields needed by cleanup; include ticketType was wasteful.
  // take: 500 prevents a single cleanup tick from loading unbounded rows into memory
  // when traffic spikes to 50K+; the next tick handles any remainder.
  return prisma.ticketHold.findMany({
    where: {
      status: HoldStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    select: {
      id: true,
      ticketTypeId: true,
      quantity: true,
      sessionId: true,
    },
    take: 500,
  });
}

export async function findActiveHolds() {
  return prisma.ticketHold.findMany({
    where: {
      status: HoldStatus.PENDING,
      expiresAt: { gt: new Date() },
    },
    include: { ticketType: { include: { event: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createTicket(
  data: {
    ticketTypeId: string;
    holdId: string;
    customerName: string;
    customerEmail: string;
    quantity: number;
    priceAtSale: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  },
  tx: Prisma.TransactionClient,
) {
  return tx.ticket.create({ data });
}

export async function findTicketByCode(ticketCode: string) {
  return prisma.ticket.findUnique({
    where: { ticketCode },
    include: { ticketType: { include: { event: true } } },
  });
}

export async function addTicketTypeSlots(ticketTypeId: string, additionalSlots: number) {
  return prisma.ticketType.update({
    where: { id: ticketTypeId },
    data: {
      totalQuantity: { increment: additionalSlots },
      availableQuantity: { increment: additionalSlots },
    },
    select: { id: true, name: true, totalQuantity: true, availableQuantity: true },
  });
}

// 5-second in-memory cache for the admin stats dashboard.
// The frontend polls every 5 s, so caching for exactly that interval means
// every displayed value is always fresh without hitting the DB 4× per request.
interface AdminStatsResult {
  totalTicketsSold: number;
  totalTransactions: number;
  totalRevenue: Prisma.Decimal;
  activeHolds: number;
  ticketTypes: Array<{
    id: string;
    name: string;
    price: Prisma.Decimal;
    totalQuantity: number;
    availableQuantity: number;
    holdQuantity: number;
  }>;
}

let _statsCache: { data: AdminStatsResult; expiresAt: number } | null = null;

export function invalidateStatsCache(): void {
  _statsCache = null;
}

export async function getAdminStats(): Promise<AdminStatsResult> {
  const nowMs = Date.now();
  if (_statsCache && _statsCache.expiresAt > nowMs) return _statsCache.data;

  const now = new Date(nowMs);

  const [ticketSummary, activeHolds, holdsByType, ticketTypes] = await prisma.$transaction([
    prisma.ticket.aggregate({
      _sum: { quantity: true, totalAmount: true },
      _count: true,
    }),
    prisma.ticketHold.count({
      where: { status: HoldStatus.PENDING, expiresAt: { gt: now } },
    }),
    prisma.ticketHold.groupBy({
      by: ['ticketTypeId'],
      where: { status: HoldStatus.PENDING, expiresAt: { gt: now } },
      _sum: { quantity: true },
      orderBy: { ticketTypeId: 'asc' },
    }),
    prisma.ticketType.findMany({
      select: {
        id: true,
        name: true,
        price: true,
        totalQuantity: true,
        availableQuantity: true,
      },
    }),
  ]);

  const holdQuantityByType = new Map(
    holdsByType.map((h) => [h.ticketTypeId, h._sum?.quantity ?? 0]),
  );

  const result: AdminStatsResult = {
    totalTicketsSold: ticketSummary._sum.quantity ?? 0,
    totalTransactions: ticketSummary._count,
    totalRevenue: ticketSummary._sum.totalAmount ?? new Prisma.Decimal(0),
    activeHolds,
    ticketTypes: ticketTypes.map((tt) => ({
      ...tt,
      holdQuantity: holdQuantityByType.get(tt.id) ?? 0,
    })),
  };

  _statsCache = { data: result, expiresAt: nowMs + 5_000 };
  return result;
}
