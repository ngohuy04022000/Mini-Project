import { Server as SocketIOServer, Socket } from 'socket.io';
import { findActiveEvent } from '../repositories/eventRepository';
import { logger } from '../utils/logger';

let io: SocketIOServer | null = null;

export function setSocketServer(socketServer: SocketIOServer): void {
  io = socketServer;
}

export function getSocketServer(): SocketIOServer | null {
  return io;
}

interface TicketCountPayload {
  eventId: string;
  ticketCounts: Array<{
    id: string;
    name: string;
    availableQuantity: number;
    totalQuantity: number;
    price: unknown;
  }>;
  timestamp: string;
}

// 1-second cache: absorbs thundering-herd of socket connections at flash-sale start
// (5 000 concurrent connects → 1 DB query instead of 5 000).
// broadcastTicketUpdate always forces a fresh query and updates this cache.
let _connectionCache: { payload: TicketCountPayload; validUntil: number } | null = null;

async function buildPayload(): Promise<TicketCountPayload | null> {
  const event = await findActiveEvent();
  if (!event) return null;
  return {
    eventId: event.id,
    ticketCounts: event.ticketTypes.map((tt) => ({
      id: tt.id,
      name: tt.name,
      availableQuantity: tt.availableQuantity,
      totalQuantity: tt.totalQuantity,
      price: tt.price,
    })),
    timestamp: new Date().toISOString(),
  };
}

// Called after a real inventory change (hold / release / payment / add-slots).
// Always queries fresh data, updates the connection cache, then broadcasts to all.
export async function broadcastTicketUpdate(): Promise<void> {
  if (!io) return;
  try {
    const payload = await buildPayload();
    if (!payload) return;
    _connectionCache = { payload, validUntil: Date.now() + 1_000 };
    io.emit('ticket_count_updated', payload);
    logger.debug('Broadcasted ticket count update');
  } catch (err) {
    logger.error('Failed to broadcast ticket update:', err);
  }
}

// Called once per new socket connection.
// Uses the 1-second cache to avoid a DB query for every connection in a burst.
export async function emitCurrentCountsToSocket(socket: Socket): Promise<void> {
  try {
    const now = Date.now();
    let payload: TicketCountPayload | null;
    if (_connectionCache && _connectionCache.validUntil > now) {
      payload = _connectionCache.payload;
    } else {
      payload = await buildPayload();
      if (payload) {
        _connectionCache = { payload, validUntil: now + 1_000 };
      }
    }
    if (payload) {
      socket.emit('ticket_count_updated', payload);
    }
  } catch (err) {
    logger.error('Failed to send initial ticket counts:', err);
  }
}

export function broadcastHoldExpired(holdId: string, sessionId: string): void {
  if (!io) return;
  io.emit('hold_expired', { holdId, sessionId, timestamp: new Date().toISOString() });
}
