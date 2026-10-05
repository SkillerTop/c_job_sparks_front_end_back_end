import { resolve } from 'node:path';
import { z } from 'zod';

const booleanFromString = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL must use the postgres or postgresql scheme.',
  }),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
  DB_SSL_REJECT_UNAUTHORIZED: booleanFromString.default(true),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(250).default(5_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(250).default(15_000),
  MIGRATIONS_DIR: z.string().min(1).default('./migrations'),
  MEDIA_ROOT: z.string().min(1).default('./data/media'),
  COOKIE_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default('c_job_sparks_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 365).default(24 * 7),
  TRUST_PROXY: booleanFromString.default(false),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
});

export type Environment = Omit<z.infer<typeof environmentSchema>, 'CORS_ORIGINS' | 'MIGRATIONS_DIR' | 'MEDIA_ROOT'> & {
  CORS_ORIGINS: readonly string[];
  MIGRATIONS_DIR: string;
  MEDIA_ROOT: string;
};

let cachedEnvironment: Environment | undefined;

export const parseEnvironment = (source: NodeJS.ProcessEnv): Environment => {
  const parsed = environmentSchema.parse(source);
  const origins = parsed.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    throw new Error('CORS_ORIGINS must contain explicit credentialed-request origins.');
  }
  return {
    ...parsed,
    CORS_ORIGINS: origins,
    MIGRATIONS_DIR: resolve(parsed.MIGRATIONS_DIR),
    MEDIA_ROOT: resolve(parsed.MEDIA_ROOT),
  };
};

export const getEnvironment = (): Environment => {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
};

export const resetEnvironmentForTests = () => {
  cachedEnvironment = undefined;
};
