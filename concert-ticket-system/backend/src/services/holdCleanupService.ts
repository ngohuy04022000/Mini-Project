import { releaseExpiredHolds } from './ticketService';
import { broadcastTicketUpdate, broadcastHoldExpired } from './socketService';
import { findExpiredPendingHolds } from '../repositories/ticketRepository';
import { logger } from '../utils/logger';

let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;

export function startHoldCleanupJob(): void {
  // Run cleanup every 30 seconds
  cleanupInterval = setInterval(async () => {
    // Skip this tick if the previous run is still in flight to avoid
    // double-releasing the same holds under unexpected slowness.
    if (isRunning) return;
    isRunning = true;

    try {
      // Fetch expired holds once and reuse for both release and notifications.
      const expiredHolds = await findExpiredPendingHolds();

      if (expiredHolds.length > 0) {
        const releasedCount = await releaseExpiredHolds(expiredHolds);

        if (releasedCount > 0) {
          // Notify each session owner their hold expired
          for (const hold of expiredHolds) {
            broadcastHoldExpired(hold.id, hold.sessionId);
          }

          // Broadcast updated ticket counts
          await broadcastTicketUpdate();
          logger.info(`Cleanup job released ${releasedCount} expired holds`);
        }
      }
    } catch (err) {
      logger.error('Hold cleanup job error:', err);
    } finally {
      isRunning = false;
    }
  }, 30000);

  logger.info('Hold cleanup job started (interval: 30s)');
}

export function stopHoldCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Hold cleanup job stopped');
  }
}

// Schedule an immediate expiry notification for the session that owns the hold.
// No DB check here — at 50K concurrent holds a per-timer SELECT would cause a
// thundering-herd read spike. The client ignores the event when already on the
// success page; the cleanup job handles actual inventory release.
export function scheduleHoldExpiry(holdId: string, sessionId: string, expiresAt: Date): void {
  const delay = expiresAt.getTime() - Date.now();
  if (delay <= 0) return;

  setTimeout(() => {
    broadcastHoldExpired(holdId, sessionId);
    logger.debug(`Scheduled expiry notified for hold ${holdId}`);
  }, delay);
}
