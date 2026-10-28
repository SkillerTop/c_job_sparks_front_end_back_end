import type { Pool, PoolClient } from 'pg';

export type TransactionIsolationLevel =
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: TransactionIsolationLevel;
  readOnly?: boolean;
  maxRetries?: number;
}

const retryableTransactionCodes = new Set(['40001', '40P01']);

const postgresCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
};

const backoff = async (attempt: number) => {
  const milliseconds = Math.min(250, 10 * 2 ** attempt) + Math.floor(Math.random() * 10);
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export const withTransaction = async <T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> => {
  const isolationLevel = options.isolationLevel ?? 'READ COMMITTED';
  const maxRetries = options.maxRetries ?? 0;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    throw new RangeError('maxRetries must be an integer between 0 and 10.');
  }

  for (let attempt = 0; ; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `SET TRANSACTION ISOLATION LEVEL ${isolationLevel}${options.readOnly ? ' READ ONLY' : ''}`,
      );
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original transaction error.
      }
      if (attempt < maxRetries && retryableTransactionCodes.has(postgresCode(error) ?? '')) {
        await backoff(attempt);
        continue;
      }
      throw error;
    } finally {
      client.release();
    }
  }
};
