import { Pool, type PoolConfig } from 'pg';
import { getEnvironment, type Environment } from '../config/env.js';

export type DatabaseEnvironment = Pick<
  Environment,
  | 'DATABASE_URL'
  | 'DATABASE_SSL'
  | 'DB_SSL_REJECT_UNAUTHORIZED'
  | 'DB_POOL_MAX'
  | 'DB_IDLE_TIMEOUT_MS'
  | 'DB_CONNECTION_TIMEOUT_MS'
  | 'DB_STATEMENT_TIMEOUT_MS'
>;

export const poolConfiguration = (environment: DatabaseEnvironment): PoolConfig => ({
  connectionString: environment.DATABASE_URL,
  max: environment.DB_POOL_MAX,
  idleTimeoutMillis: environment.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: environment.DB_CONNECTION_TIMEOUT_MS,
  statement_timeout: environment.DB_STATEMENT_TIMEOUT_MS,
  application_name: 'c-job-sparks-api',
  ssl:
    environment.DATABASE_SSL === 'require'
      ? { rejectUnauthorized: environment.DB_SSL_REJECT_UNAUTHORIZED }
      : false,
});

export const createPool = (environment: DatabaseEnvironment = getEnvironment()) => {
  const pool = new Pool(poolConfiguration(environment));
  pool.on('error', (error) => {
    process.stderr.write(`Unexpected idle PostgreSQL client error: ${String(error)}\n`);
  });
  return pool;
};

let sharedPool: Pool | undefined;

export const getPool = () => {
  sharedPool ??= createPool();
  return sharedPool;
};

export const closePool = async () => {
  const pool = sharedPool;
  sharedPool = undefined;
  if (pool) await pool.end();
};
