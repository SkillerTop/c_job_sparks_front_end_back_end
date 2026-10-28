import type { Pool, PoolClient } from 'pg';
import { badRequest, conflict } from './errors.js';
import { requestHash } from './security.js';

interface IdempotencyRow {
  request_hash: string;
  status: 'Processing' | 'Completed' | 'Failed';
  response_status: number | null;
  response_body: unknown;
}

export interface IdempotentResult<T> {
  value: T;
  statusCode: number;
  replayed: boolean;
}

const serializable = async <T>(pool: Pool, work: (db: PoolClient) => Promise<T>) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const result = await work(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      if (
        attempt < 2 &&
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === '40001' || error.code === '40P01')
      )
        continue;
      throw error;
    } finally {
      db.release();
    }
  }
  throw new Error('Serializable transaction retry limit exceeded.');
};

export const withIdempotency = async <T>(
  pool: Pool,
  ownerUserId: string,
  scope: string,
  key: string | undefined,
  body: unknown,
  statusCode: number,
  work: (db: PoolClient) => Promise<T>,
): Promise<IdempotentResult<T>> => {
  if (!key || key.length < 8 || key.length > 255)
    throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Provide an Idempotency-Key header between 8 and 255 characters.');
  const digest = requestHash(body);
  return serializable(pool, async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`${ownerUserId}:${scope}:${key}`]);
    const existingResult = await db.query<IdempotencyRow>(
      `SELECT request_hash, status, response_status, response_body
         FROM app.idempotency_keys
        WHERE owner_user_id=$1 AND scope=$2 AND idempotency_key=$3
        FOR UPDATE`,
      [ownerUserId, scope, key],
    );
    const existing = existingResult.rows[0];
    if (existing) {
      if (existing.request_hash !== digest)
        throw conflict('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a different request.');
      if (existing.status === 'Completed') {
        return {
          value: existing.response_body as T,
          statusCode: existing.response_status ?? statusCode,
          replayed: true,
        };
      }
      throw conflict('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    }
    await db.query(
      `INSERT INTO app.idempotency_keys
        (owner_user_id, scope, idempotency_key, request_hash, expires_at)
       VALUES ($1,$2,$3,$4,clock_timestamp() + interval '10 years')`,
      [ownerUserId, scope, key, digest],
    );
    const value = await work(db);
    await db.query(
      `UPDATE app.idempotency_keys
          SET status='Completed', response_status=$4, response_body=$5::jsonb, completed_at=clock_timestamp()
        WHERE owner_user_id=$1 AND scope=$2 AND idempotency_key=$3`,
      [ownerUserId, scope, key, statusCode, JSON.stringify(value)],
    );
    return { value, statusCode, replayed: false };
  });
};

export const withTransaction = serializable;
