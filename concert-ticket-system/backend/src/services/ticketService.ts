import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { env } from '../config/env';
import {
  ConflictError,
  HoldExpiredError,
  HoldNotFoundError,
  NotFoundError,
  SoldOutError,
  ValidationError,
} from '../utils/AppError';
import { withLock } from '../utils/redisLock';
import {
  batchExpireHolds,
  confirmHold,
  createHold,
  createTicket,
  decrementAvailableQuantity,
  expireHold,
  findExpiredPendingHolds,
  findHoldById,
  findActiveHoldBySession,
  getAdminStats,
  incrementAvailableQuantity,
  releaseHold,
} from '../repositories/ticketRepository';
import { findEventById } from '../repositories/eventRepository';
import { logger } from '../utils/logger';

export interface HoldTicketInput {
  ticketTypeId: string;
  sessionId: string;
  quantity: number;
}

export interface PaymentInput {
  holdId: string;
  sessionId: string;
  customerName: string;
  customerEmail: string;
}

export async function holdTicket(input: HoldTicketInput) {
  const { ticketTypeId, sessionId, quantity } = input;

  if (quantity < 1 || quantity > 4) {
    throw new ValidationError('Số lượng vé phải từ 1 đến 4');
  }

  // Check for existing active hold from same session for same ticket type
  const existingHold = await findActiveHoldBySession(sessionId, ticketTypeId);
  if (existingHold) {
    throw new ConflictError('Bạn đang có vé đang giữ cho loại vé này. Vui lòng hoàn tất thanh toán.');
  }

  // Use Redis distributed lock to prevent concurrent hold requests for same ticket type
  // This is the application-layer defense (first line)
  // The atomic SQL UPDATE is the database-layer defense (second line)
  return withLock(`ticket-type:${ticketTypeId}`, async () => {
    return prisma.$transaction(async (tx) => {
      // Verify ticket type exists and has enough quantity
      const ticketType = await tx.ticketType.findUnique({
        where: { id: ticketTypeId },
      });

      if (!ticketType) {
        throw new NotFoundError('Loại vé');
      }

      if (ticketType.availableQuantity < quantity) {
        throw new SoldOutError();
      }

      if (quantity > ticketType.maxPerOrder) {
        throw new ValidationError(`Tối đa ${ticketType.maxPerOrder} vé mỗi lần đặt`);
      }

      // Atomic decrement - will fail if quantity becomes negative
      const decremented = await decrementAvailableQuantity(ticketTypeId, quantity, tx);
      if (!decremented) {
        throw new SoldOutError();
      }

      const expiresAt = new Date(Date.now() + env.HOLD_DURATION_MINUTES * 60 * 1000);
      const hold = await createHold({ ticketTypeId, sessionId, quantity, expiresAt }, tx);

      logger.info(`Ticket held: holdId=${hold.id}, type=${ticketType.name}, qty=${quantity}`);
      return { hold, ticketType };
    });
  });
}

export async function processPayment(input: PaymentInput) {
  const { holdId, sessionId, customerName, customerEmail } = input;

  const hold = await findHoldById(holdId);

  if (!hold) {
    throw new HoldNotFoundError();
  }

  if (hold.sessionId !== sessionId) {
    throw new HoldNotFoundError();
  }

  if (hold.status !== 'PENDING') {
    if (hold.status === 'CONFIRMED') {
      throw new ConflictError('Vé này đã được thanh toán rồi.');
    }
    throw new HoldExpiredError();
  }

  if (new Date() > hold.expiresAt) {
    // Auto-expire and release
    await prisma.$transaction(async (tx) => {
      await expireHold(holdId, tx);
      await incrementAvailableQuantity(hold.ticketTypeId, hold.quantity, tx);
    });
    throw new HoldExpiredError();
  }

  // Process payment in a transaction
  const ticket = await prisma.$transaction(async (tx) => {
    await confirmHold(holdId, tx);

    const priceAtSale = hold.ticketType.price;
    const totalAmount = new Prisma.Decimal(priceAtSale.toString()).mul(hold.quantity);

    const createdTicket = await createTicket(
      {
        ticketTypeId: hold.ticketTypeId,
        holdId: hold.id,
        customerName,
        customerEmail,
        quantity: hold.quantity,
        priceAtSale,
        totalAmount,
      },
      tx,
    );

    return createdTicket;
  });

  logger.info(`Payment processed: ticketId=${ticket.id}, email=${customerEmail}`);
  return ticket;
}

export interface ExpiredHoldInfo {
  id: string;
  ticketTypeId: string;
  quantity: number;
}

/**
 * Release expired holds back into inventory in a single batched transaction.
 * Accepts an optional pre-fetched list so callers that already queried expired
 * holds (e.g. the cleanup job) don't pay for a second identical query.
 */
export async function releaseExpiredHolds(prefetched?: ExpiredHoldInfo[]): Promise<number> {
  const expiredHolds = prefetched ?? (await findExpiredPendingHolds());

  if (expiredHolds.length === 0) return 0;

  // Aggregate quantity per ticket type so we issue one increment per type
  // instead of one per hold.
  const quantityByType = new Map<string, number>();
  for (const hold of expiredHolds) {
    quantityByType.set(
      hold.ticketTypeId,
      (quantityByType.get(hold.ticketTypeId) ?? 0) + hold.quantity,
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const expiredCount = await batchExpireHolds(
        expiredHolds.map((h) => h.id),
        tx,
      );
      for (const [ticketTypeId, quantity] of quantityByType) {
        await incrementAvailableQuantity(ticketTypeId, quantity, tx);
      }
      logger.info(`Released ${expiredCount} expired holds back to inventory`);
      return expiredCount;
    });
  } catch (err) {
    logger.error('Failed to batch-release expired holds:', err);
    return 0;
  }
}

export async function manualReleaseHold(holdId: string, sessionId: string): Promise<void> {
  const hold = await findHoldById(holdId);

  if (!hold || hold.sessionId !== sessionId) {
    throw new HoldNotFoundError();
  }

  if (hold.status !== 'PENDING') {
    throw new ConflictError('Vé này không còn trong trạng thái chờ.');
  }

  await prisma.$transaction(async (tx) => {
    await releaseHold(holdId, tx);
    await incrementAvailableQuantity(hold.ticketTypeId, hold.quantity, tx);
  });

  logger.info(`Hold manually released: holdId=${holdId}`);
}

export async function getEventWithAvailability(eventId: string) {
  const event = await findEventById(eventId);
  if (!event) throw new NotFoundError('Sự kiện');
  return event;
}

export { getAdminStats };
