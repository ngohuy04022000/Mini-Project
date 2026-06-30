// Mock Redis before importing
const mockSet = jest.fn();
const mockEval = jest.fn();

jest.mock('../../src/config/redis', () => ({
  getRedisClient: jest.fn(() => ({
    set: mockSet,
    eval: mockEval,
  })),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_URL: 'redis://localhost:6379',
    PORT: 3000,
    DATABASE_URL: 'postgresql://test',
    JWT_SECRET: 'test-secret-key-minimum-16',
    HOLD_DURATION_MINUTES: 5,
    FRONTEND_URL: 'http://localhost:5173',
  },
}));

import { acquireLock, releaseLock, withLock } from '../../src/utils/redisLock';

describe('Redis Distributed Lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('acquireLock', () => {
    it('should return a lock value when lock is acquired successfully', async () => {
      mockSet.mockResolvedValue('OK');
      const lockValue = await acquireLock('test-resource');
      expect(lockValue).not.toBeNull();
      expect(mockSet).toHaveBeenCalledWith(
        'lock:test-resource',
        expect.any(String),
        'PX',
        10000,
        'NX',
      );
    });

    it('should return null when lock is already held', async () => {
      mockSet.mockResolvedValue(null);
      const lockValue = await acquireLock('test-resource');
      expect(lockValue).toBeNull();
    });
  });

  describe('releaseLock', () => {
    it('should execute Lua script to atomically release lock', async () => {
      mockEval.mockResolvedValue(1);
      await releaseLock('test-resource', 'lock-value-123');
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('GET'),
        1,
        'lock:test-resource',
        'lock-value-123',
      );
    });
  });

  describe('withLock', () => {
    it('should execute function when lock is acquired', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const mockFn = jest.fn().mockResolvedValue('result');
      const result = await withLock('test-resource', mockFn);

      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('should release lock even when function throws', async () => {
      mockSet.mockResolvedValue('OK');
      mockEval.mockResolvedValue(1);

      const mockFn = jest.fn().mockRejectedValue(new Error('Function failed'));

      await expect(withLock('test-resource', mockFn)).rejects.toThrow('Function failed');
      expect(mockEval).toHaveBeenCalled(); // Lock was released
    });

    it('should retry and throw when lock cannot be acquired after all retries', async () => {
      mockSet.mockResolvedValue(null); // Always fails to acquire

      await expect(withLock('test-resource', jest.fn(), 2)).rejects.toThrow(
        'Failed to acquire lock',
      );
    });
  });
});
