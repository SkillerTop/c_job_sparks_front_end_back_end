import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type Queryable = Pick<Pool | PoolClient, 'query'>;

export const one = async <T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values: readonly unknown[] = [],
): Promise<T> => {
  const result = (await db.query(text, [...values])) as QueryResult<T>;
  if (result.rowCount !== 1) throw new Error(`Expected one row, received ${result.rowCount ?? 0}.`);
  return result.rows[0]!;
};

export const maybeOne = async <T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values: readonly unknown[] = [],
): Promise<T | null> => {
  const result = (await db.query(text, [...values])) as QueryResult<T>;
  if ((result.rowCount ?? 0) > 1) throw new Error(`Expected at most one row, received ${result.rowCount}.`);
  return result.rows[0] ?? null;
};

export const rows = async <T extends QueryResultRow>(
  db: Queryable,
  text: string,
  values: readonly unknown[] = [],
) => ((await db.query(text, [...values])) as QueryResult<T>).rows;
