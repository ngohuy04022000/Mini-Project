import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  holdTicket,
  processPayment,
  manualReleaseHold,
  getAdminStats,
} from '../services/ticketService';
import {
  findActiveHolds,
  findHoldById,
  findTicketByCode,
  addTicketTypeSlots,
  invalidateStatsCache,
} from '../repositories/ticketRepository';
import { broadcastTicketUpdate } from '../services/socketService';
import { scheduleHoldExpiry } from '../services/holdCleanupService';
import { HoldNotFoundError, NotFoundError, ValidationError } from '../utils/AppError';

export const holdTicketSchema = z.object({
  ticketTypeId: z.string().uuid('ticketTypeId phải là UUID hợp lệ'),
  sessionId: z.string().min(1, 'sessionId là bắt buộc'),
  quantity: z.number().int().min(1).max(4),
});

export const paymentSchema = z.object({
  holdId: z.string().uuid('holdId phải là UUID hợp lệ'),
  sessionId: z.string().min(1, 'sessionId là bắt buộc'),
  customerName: z.string().min(2, 'Tên phải có ít nhất 2 ký tự').max(100),
  customerEmail: z.string().email('Email không hợp lệ'),
});

export const releaseHoldSchema = z.object({
  holdId: z.string().uuid(),
  sessionId: z.string().min(1),
});

export async function holdTicketHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = holdTicketSchema.parse(req.body);
    const { hold, ticketType } = await holdTicket(validated);

    // Schedule expiry notification
    scheduleHoldExpiry(hold.id, hold.sessionId, hold.expiresAt);

    // Broadcast updated counts
    await broadcastTicketUpdate();

    res.status(201).json({
      success: true,
      data: {
        holdId: hold.id,
        ticketTypeId: ticketType.id,
        ticketTypeName: ticketType.name,
        quantity: hold.quantity,
        pricePerTicket: Number(ticketType.price),
        totalPrice: Number(ticketType.price) * hold.quantity,
        expiresAt: hold.expiresAt,
        expiresInSeconds: Math.floor((hold.expiresAt.getTime() - Date.now()) / 1000),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function processPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = paymentSchema.parse(req.body);
    const ticket = await processPayment(validated);

    invalidateStatsCache();

    res.status(200).json({
      success: true,
      data: {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        quantity: ticket.quantity,
        totalAmount: Number(ticket.totalAmount),
        message: `Đặt vé thành công! Mã vé của bạn là ${ticket.ticketCode}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function releaseHoldHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validated = releaseHoldSchema.parse(req.body);
    await manualReleaseHold(validated.holdId, validated.sessionId);
    await broadcastTicketUpdate();

    res.json({ success: true, data: { message: 'Đã hủy giữ vé thành công' } });
  } catch (err) {
    next(err);
  }
}

export async function getHoldStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { holdId } = req.params;
    const sessionId = String(req.query.sessionId ?? '');

    const hold = await findHoldById(holdId);

    if (!hold || hold.sessionId !== sessionId) {
      throw new HoldNotFoundError();
    }

    const now = new Date();
    const isExpired = now > hold.expiresAt;
    const secondsRemaining = isExpired ? 0 : Math.floor((hold.expiresAt.getTime() - now.getTime()) / 1000);

    res.json({
      success: true,
      data: {
        holdId: hold.id,
        status: hold.status,
        quantity: hold.quantity,
        expiresAt: hold.expiresAt,
        secondsRemaining,
        isExpired,
        ticketType: {
          id: hold.ticketType.id,
          name: hold.ticketType.name,
          price: Number(hold.ticketType.price),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function lookupTicketHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ticketCode = String(req.params.ticketCode || '').trim();
    if (!ticketCode) {
      throw new NotFoundError('Vé');
    }

    const ticket = await findTicketByCode(ticketCode);
    if (!ticket) {
      throw new NotFoundError('Vé');
    }

    res.json({
      success: true,
      data: {
        ticketCode: ticket.ticketCode,
        status: ticket.status,
        customerName: ticket.customerName,
        customerEmail: ticket.customerEmail,
        quantity: ticket.quantity,
        totalAmount: Number(ticket.totalAmount),
        purchasedAt: ticket.createdAt,
        ticketTypeName: ticket.ticketType.name,
        eventName: ticket.ticketType.event.name,
        eventVenue: ticket.ticketType.event.venue,
        eventDate: ticket.ticketType.event.eventDate,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getAdminStatsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const stats = await getAdminStats();
    res.json({
      success: true,
      data: {
        totalTicketsSold: stats.totalTicketsSold,
        totalTransactions: stats.totalTransactions,
        totalRevenue: Number(stats.totalRevenue),
        activeHolds: stats.activeHolds,
        ticketTypes: stats.ticketTypes.map((tt) => ({
          id: tt.id,
          name: tt.name,
          price: Number(tt.price),
          totalQuantity: tt.totalQuantity,
          availableQuantity: tt.availableQuantity,
          soldQuantity: tt.totalQuantity - tt.availableQuantity - tt.holdQuantity,
          holdQuantity: tt.holdQuantity,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

const addSlotsSchema = z.object({
  additionalSlots: z.number().int().min(1).max(10_000),
});

export async function addSlotsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new ValidationError('id là bắt buộc');
    const { additionalSlots } = addSlotsSchema.parse(req.body);

    const ticketType = await addTicketTypeSlots(id, additionalSlots);
    invalidateStatsCache();
    await broadcastTicketUpdate();

    res.json({
      success: true,
      data: {
        id: ticketType.id,
        name: ticketType.name,
        addedSlots: additionalSlots,
        newTotalQuantity: ticketType.totalQuantity,
        newAvailableQuantity: ticketType.availableQuantity,
        message: `Đã thêm ${additionalSlots} slot cho ${ticketType.name}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getActiveHoldsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const holds = await findActiveHolds();
    res.json({
      success: true,
      data: holds.map((h) => ({
        id: h.id,
        sessionId: h.sessionId.substring(0, 8) + '***', // Mask for privacy
        ticketTypeName: h.ticketType.name,
        eventName: h.ticketType.event.name,
        quantity: h.quantity,
        expiresAt: h.expiresAt,
        secondsRemaining: Math.max(0, Math.floor((h.expiresAt.getTime() - Date.now()) / 1000)),
        createdAt: h.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}
