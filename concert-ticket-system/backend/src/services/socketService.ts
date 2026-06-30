import { Server as SocketIOServer } from 'socket.io';
import { findActiveEvent } from '../repositories/eventRepository';
import { logger } from '../utils/logger';

let io: SocketIOServer | null = null;

export function setSocketServer(socketServer: SocketIOServer): void {
  io = socketServer;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

export async function broadcastTicketUpdate(): Promise<void> {
  if (!io) return;

  try {
    const event = await findActiveEvent();
    if (!event) return;

    const ticketCounts = event.ticketTypes.map((tt) => ({
      id: tt.id,
      name: tt.name,
      availableQuantity: tt.availableQuantity,
      totalQuantity: tt.totalQuantity,
      price: tt.price,
    }));

    io.emit('ticket_count_updated', {
      eventId: event.id,
      ticketCounts,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Broadcasted ticket count update');
  } catch (err) {
    logger.error('Failed to broadcast ticket update:', err);
  }
}

export function broadcastHoldExpired(holdId: string, sessionId: string): void {
  if (!io) return;
  io.emit('hold_expired', { holdId, sessionId, timestamp: new Date().toISOString() });
}
