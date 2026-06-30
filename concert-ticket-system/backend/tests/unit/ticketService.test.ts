import { PrismaClient } from '@prisma/client';
import {
  SoldOutError,
  ConflictError,
  HoldExpiredError,
  ValidationError,
} from '../../src/utils/AppError';

// Mock dependencies before importing the service
jest.mock('../../src/config/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    ticketType: { findUnique: jest.fn() },
    ticketHold: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ticket: { create: jest.fn() },
  },
}));

jest.mock('../../src/repositories/ticketRepository');
jest.mock('../../src/repositories/eventRepository');
jest.mock('../../src/utils/redisLock', () => ({
  withLock: jest.fn((_resource: string, fn: () => Promise<unknown>) => fn()),
}));
jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    DATABASE_URL: 'postgresql://test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-minimum-16',
    HOLD_DURATION_MINUTES: 5,
    FRONTEND_URL: 'http://localhost:5173',
  },
}));

import * as ticketRepo from '../../src/repositories/ticketRepository';
import { prisma } from '../../src/config/database';
import { holdTicket, processPayment, releaseExpiredHolds } from '../../src/services/ticketService';

const mockTicketRepo = ticketRepo as jest.Mocked<typeof ticketRepo>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// Helper to mock $transaction with correct Prisma types
function mockTransaction(impl: (fn: (tx: PrismaClient) => Promise<unknown>) => Promise<unknown>) {
  (mockPrisma.$transaction as jest.Mock).mockImplementation(impl as unknown as typeof prisma.$transaction);
}

describe('TicketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('holdTicket', () => {
    const validInput = {
      ticketTypeId: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: 'test-session-123',
      quantity: 1,
    };

    it('should throw ValidationError when quantity is 0', async () => {
      await expect(holdTicket({ ...validInput, quantity: 0 })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when quantity exceeds 4', async () => {
      await expect(holdTicket({ ...validInput, quantity: 5 })).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError when session already has an active hold', async () => {
      mockTicketRepo.findActiveHoldBySession.mockResolvedValue({
        id: 'existing-hold',
        ticketTypeId: validInput.ticketTypeId,
        sessionId: validInput.sessionId,
        quantity: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 300000),
        customerName: null,
        customerEmail: null,
        confirmedAt: null,
        releasedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(holdTicket(validInput)).rejects.toThrow(ConflictError);
    });

    it('should throw SoldOutError when no tickets are available', async () => {
      mockTicketRepo.findActiveHoldBySession.mockResolvedValue(null);

      mockTransaction(async (fn) => {
        const mockTx = {
          ticketType: {
            findUnique: jest.fn().mockResolvedValue({
              id: validInput.ticketTypeId,
              name: 'Standard',
              availableQuantity: 0,
              maxPerOrder: 4,
              price: 1500000,
            }),
          },
        };
        return fn(mockTx as unknown as PrismaClient);
      });

      await expect(holdTicket(validInput)).rejects.toThrow(SoldOutError);
    });

    it('should successfully hold a ticket when quantity is available', async () => {
      mockTicketRepo.findActiveHoldBySession.mockResolvedValue(null);
      mockTicketRepo.decrementAvailableQuantity.mockResolvedValue(true);

      const mockHold = {
        id: 'new-hold-id',
        ticketTypeId: validInput.ticketTypeId,
        sessionId: validInput.sessionId,
        quantity: validInput.quantity,
        status: 'PENDING' as const,
        expiresAt: new Date(Date.now() + 300000),
        customerName: null,
        customerEmail: null,
        confirmedAt: null,
        releasedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockTicketType = {
        id: validInput.ticketTypeId,
        name: 'Standard',
        availableQuantity: 100,
        maxPerOrder: 4,
        price: { toString: () => '1500000' } as unknown as ReturnType<typeof Number>,
        eventId: 'event-id',
        description: null,
        totalQuantity: 300,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockTransaction(async (fn) => {
        const mockTx = {
          ticketType: { findUnique: jest.fn().mockResolvedValue(mockTicketType) },
        };
        mockTicketRepo.createHold.mockResolvedValue(mockHold);
        return fn(mockTx as unknown as PrismaClient);
      });

      const result = await holdTicket(validInput);
      expect(result.hold.id).toBe('new-hold-id');
    });

    it('should throw SoldOutError when atomic decrement fails (race condition)', async () => {
      mockTicketRepo.findActiveHoldBySession.mockResolvedValue(null);
      mockTicketRepo.decrementAvailableQuantity.mockResolvedValue(false); // Race condition

      mockTransaction(async (fn) => {
        const mockTx = {
          ticketType: {
            findUnique: jest.fn().mockResolvedValue({
              id: validInput.ticketTypeId,
              name: 'Standard',
              availableQuantity: 1,
              maxPerOrder: 4,
              price: 1500000,
            }),
          },
        };
        return fn(mockTx as unknown as PrismaClient);
      });

      await expect(holdTicket(validInput)).rejects.toThrow(SoldOutError);
    });
  });

  describe('processPayment', () => {
    const validPayment = {
      holdId: '550e8400-e29b-41d4-a716-446655440001',
      sessionId: 'test-session-123',
      customerName: 'Nguyen Van A',
      customerEmail: 'test@example.com',
    };

    it('should throw HoldNotFoundError when hold does not exist', async () => {
      mockTicketRepo.findHoldById.mockResolvedValue(null);
      await expect(processPayment(validPayment)).rejects.toThrow('Không tìm thấy vé đang giữ');
    });

    it('should throw HoldNotFoundError when sessionId does not match', async () => {
      (mockTicketRepo.findHoldById as jest.Mock).mockResolvedValue({
        id: validPayment.holdId,
        sessionId: 'different-session',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 300000),
        ticketTypeId: 'type-id',
        quantity: 1,
        customerName: null,
        customerEmail: null,
        confirmedAt: null,
        releasedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ticketType: { id: 'type-id', price: 1500000 },
      });

      await expect(processPayment(validPayment)).rejects.toThrow('Không tìm thấy vé đang giữ');
    });

    it('should throw HoldExpiredError when hold has expired', async () => {
      (mockTicketRepo.findHoldById as jest.Mock).mockResolvedValue({
        id: validPayment.holdId,
        sessionId: validPayment.sessionId,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000), // Already expired
        ticketTypeId: 'type-id',
        quantity: 1,
        customerName: null,
        customerEmail: null,
        confirmedAt: null,
        releasedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ticketType: { id: 'type-id', price: 1500000 },
      });

      mockTransaction(async (fn) => fn({} as PrismaClient));
      mockTicketRepo.expireHold.mockResolvedValue({} as ReturnType<typeof mockTicketRepo.expireHold> extends Promise<infer T> ? T : never);
      mockTicketRepo.incrementAvailableQuantity.mockResolvedValue(undefined);

      await expect(processPayment(validPayment)).rejects.toThrow(HoldExpiredError);
    });
  });

  describe('releaseExpiredHolds', () => {
    it('should return 0 when no expired holds exist', async () => {
      mockTicketRepo.findExpiredPendingHolds.mockResolvedValue([]);
      const count = await releaseExpiredHolds();
      expect(count).toBe(0);
    });

    it('should release all expired holds and return count', async () => {
      const expiredHolds = [
        {
          id: 'hold-1',
          ticketTypeId: 'type-1',
          quantity: 2,
          sessionId: 'session-1',
          status: 'PENDING' as const,
          expiresAt: new Date(Date.now() - 1000),
          customerName: null,
          customerEmail: null,
          confirmedAt: null,
          releasedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ticketType: { id: 'type-1', name: 'Standard' } as never,
        },
      ];

      mockTicketRepo.findExpiredPendingHolds.mockResolvedValue(expiredHolds as never);
      mockTransaction(async (fn) => fn({} as PrismaClient));
      mockTicketRepo.batchExpireHolds.mockResolvedValue(1);
      mockTicketRepo.incrementAvailableQuantity.mockResolvedValue(undefined);

      const count = await releaseExpiredHolds();
      expect(count).toBe(1);
      expect(mockTicketRepo.batchExpireHolds).toHaveBeenCalledWith(['hold-1'], expect.anything());
    });

    it('should aggregate increments per ticket type when batching', async () => {
      const expiredHolds = [
        { id: 'h1', ticketTypeId: 'type-1', quantity: 2 },
        { id: 'h2', ticketTypeId: 'type-1', quantity: 1 },
        { id: 'h3', ticketTypeId: 'type-2', quantity: 3 },
      ];

      mockTransaction(async (fn) => fn({} as PrismaClient));
      mockTicketRepo.batchExpireHolds.mockResolvedValue(3);
      mockTicketRepo.incrementAvailableQuantity.mockResolvedValue(undefined);

      // Prefetched path used by the cleanup job
      const count = await releaseExpiredHolds(expiredHolds);

      expect(count).toBe(3);
      // type-1 grouped into a single increment of 3, type-2 a single increment of 3
      expect(mockTicketRepo.incrementAvailableQuantity).toHaveBeenCalledWith(
        'type-1',
        3,
        expect.anything(),
      );
      expect(mockTicketRepo.incrementAvailableQuantity).toHaveBeenCalledWith(
        'type-2',
        3,
        expect.anything(),
      );
      expect(mockTicketRepo.incrementAvailableQuantity).toHaveBeenCalledTimes(2);
    });
  });
});
