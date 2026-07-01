import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000').transform(Number),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  HOLD_DURATION_MINUTES: z.string().default('5').transform(Number),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Optional: if set, all /api/admin/* requests must supply this value in x-admin-key header.
  ADMIN_API_KEY: z.string().min(8).optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables:', result.error.format());
  process.exit(1);
}

export const env = result.data;
