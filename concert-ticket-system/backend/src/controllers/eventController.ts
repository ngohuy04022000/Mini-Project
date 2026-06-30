import { Request, Response, NextFunction } from 'express';
import { findActiveEvent } from '../repositories/eventRepository';
import { NotFoundError } from '../utils/AppError';

export async function getActiveEvent(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const event = await findActiveEvent();
    if (!event) throw new NotFoundError('Sự kiện');

    res.json({
      success: true,
      data: {
        id: event.id,
        name: event.name,
        description: event.description,
        venue: event.venue,
        eventDate: event.eventDate,
        imageUrl: event.imageUrl,
        ticketTypes: event.ticketTypes.map((tt) => ({
          id: tt.id,
          name: tt.name,
          description: tt.description,
          price: Number(tt.price),
          totalQuantity: tt.totalQuantity,
          availableQuantity: tt.availableQuantity,
          maxPerOrder: tt.maxPerOrder,
          isSoldOut: tt.availableQuantity === 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}
