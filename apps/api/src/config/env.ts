import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(1).default('change-me'),
  JWT_REFRESH_SECRET: z.string().min(1).default('change-me'),
  NESTUS_ENCRYPTION_KEY: z.string().min(1).default('base64-32-bytes'),
  GRPC_PORT: z.coerce.number().int().positive().default(50051),
  GRPC_PUBLIC_URL: z.string().default('localhost:50051'),
  INTERNAL_SERVICE_TOKEN: z.string().min(1).default('change-me'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  GITHUB_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GITHUB_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  RESEND_FROM: z.preprocess(emptyToUndefined, z.string().email().optional()),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  cached = result.data;
  return cached;
}

export function env(): Env {
  if (!cached) return loadEnv();
  return cached;
}

export function isProd(): boolean {
  return env().NODE_ENV === 'production';
}
