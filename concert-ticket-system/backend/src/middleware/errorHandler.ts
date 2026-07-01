import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ',
        details,
      },
    } satisfies ApiResponse);
    return;
  }

  // Prisma connection pool timeout → 503
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    const is503 =
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2024';
    if (is503) {
      logger.warn('Prisma connection pool timeout (P2024)');
    } else {
      logger.error('Prisma request error:', err);
    }
    res.status(is503 ? 503 : 500).json({
      success: false,
      error: {
        code: is503 ? 'SERVICE_UNAVAILABLE' : 'DATABASE_ERROR',
        message: is503
          ? 'Hệ thống đang quá tải. Vui lòng thử lại sau vài giây.'
          : 'Đã xảy ra lỗi cơ sở dữ liệu. Vui lòng thử lại.',
      },
    } satisfies ApiResponse);
    return;
  }

  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational error:', err);
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    } satisfies ApiResponse);
    return;
  }

  // Unexpected errors
  logger.error('Unexpected error:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi nội bộ. Vui lòng thử lại sau.',
      ...(env.NODE_ENV === 'development' && { details: err.message }),
    },
  } satisfies ApiResponse);
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint không tồn tại' },
  } satisfies ApiResponse);
}
