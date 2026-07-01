import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  // If no key is configured (local dev without env), allow access.
  if (!env.ADMIN_API_KEY) {
    next();
    return;
  }
  if (req.headers['x-admin-key'] !== env.ADMIN_API_KEY) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Admin key không hợp lệ.' },
    });
    return;
  }
  next();
}
