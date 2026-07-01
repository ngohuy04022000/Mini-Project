import { getRedisClient } from '../config/redis';
import { ServiceUnavailableError } from './AppError';
import { logger } from './logger';

const LOCK_TTL_MS = 10_000;
const BASE_DELAY_MS = 50;
const MAX_DELAY_MS = 2_000;
const DEFAULT_RETRIES = 8;

// Full-jitter exponential backoff: random in [0, min(cap, base * 2^attempt)]
// Spreads retry storms across time instead of bunching them together.
function jitteredDelay(attempt: number): number {
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * Math.pow(2, attempt));
  return Math.floor(Math.random() * cap);
}

export async function acquireLock(resource: string): Promise<string | null> {
  const client = getRedisClient();
  const lockKey = `lock:${resource}`;
  const lockValue = `${Date.now()}-${Math.random()}`;

  const result = await client.set(lockKey, lockValue, 'PX', LOCK_TTL_MS, 'NX');

  if (result === 'OK') {
    logger.debug(`Lock acquired: ${resource}`);
    return lockValue;
  }

  logger.debug(`Lock failed: ${resource}`);
  return null;
}

export async function releaseLock(resource: string, lockValue: string): Promise<void> {
  const client = getRedisClient();
  const lockKey = `lock:${resource}`;

  // Atomic check-and-delete: only delete if the value matches ours
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;

  await client.eval(script, 1, lockKey, lockValue);
  logger.debug(`Lock released: ${resource}`);
}

export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>,
  retries = DEFAULT_RETRIES,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    let lockValue: string | null;
    try {
      lockValue = await acquireLock(resource);
    } catch (redisErr) {
      logger.error(`Redis error acquiring lock for ${resource}:`, redisErr);
      throw new ServiceUnavailableError();
    }

    if (lockValue) {
      try {
        return await fn();
      } finally {
        // Swallow release errors — lock TTL guarantees eventual release.
        await releaseLock(resource, lockValue).catch((err) =>
          logger.warn(`Failed to release lock for ${resource}:`, err),
        );
      }
    }

    if (attempt < retries - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, jitteredDelay(attempt)));
    }
  }

  throw new ServiceUnavailableError(
    'Hệ thống đang bận, không thể xử lý yêu cầu. Vui lòng thử lại sau vài giây.',
  );
}
