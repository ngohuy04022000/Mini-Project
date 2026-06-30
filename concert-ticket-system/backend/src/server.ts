import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { setSocketServer, broadcastTicketUpdate } from './services/socketService';
import { startHoldCleanupJob, stopHoldCleanupJob } from './services/holdCleanupService';
import { logger } from './utils/logger';

const server = http.createServer(app);

// Socket.io setup
const io = new SocketIOServer(server, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

setSocketServer(io);

io.on('connection', (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);

  // Send current ticket counts on connect
  broadcastTicketUpdate().catch((err) =>
    logger.error('Failed to send initial ticket counts:', err),
  );

  socket.on('disconnect', (reason) => {
    logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

async function start(): Promise<void> {
  try {
    logger.info('Starting Concert Ticket System...');

    await connectDatabase();
    logger.info('Database connected');

    await connectRedis();
    logger.info('Redis connected');

    startHoldCleanupJob();

    server.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      logger.info(`WebSocket server ready`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  stopHoldCleanupJob();

  server.close(async () => {
    try {
      await disconnectDatabase();
      await disconnectRedis();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

start();
