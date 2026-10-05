import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

const migrationNamePattern = /^(\d{4,})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const migrationLockName = 'c-job-sparks-schema-migrations-v1';
const maximumPostgresBigint = 9_223_372_036_854_775_807n;

export interface Migration {
  version: string;
  fileName: string;
  description: string;
  checksum: string;
  sql: string;
}

export interface AppliedMigration {
  version: string;
  fileName: string;
  checksum: string;
  appliedAt: Date;
  executionMs: number;
}

export interface MigrationPlan {
  applied: readonly Migration[];
  pending: readonly Migration[];
}

export interface MigrationIo {
  listFiles(directory: string): Promise<readonly string[]>;
  readText(path: string): Promise<string>;
}

const nodeMigrationIo: MigrationIo = {
  async listFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  },
  readText: (path) => readFile(path, 'utf8'),
};

export const parseMigrationFileName = (fileName: string) => {
  const match = migrationNamePattern.exec(fileName);
  if (!match?.[1] || !match[2]) {
    throw new Error(
      `Invalid migration file name "${fileName}"; expected NNNN_lowercase_description.sql.`,
    );
  }
  const numericVersion = BigInt(match[1]);
  const canonicalVersion = numericVersion.toString();
  if (numericVersion === 0n) throw new Error('Migration version must be greater than zero.');
  if (numericVersion > maximumPostgresBigint) throw new Error('Migration version exceeds PostgreSQL bigint.');
  return { version: canonicalVersion, description: match[2] };
};

export const migrationChecksum = (sql: string) =>
  createHash('sha256').update(sql.replaceAll('\r\n', '\n'), 'utf8').digest('hex');

export const discoverMigrations = async (
  directory: string,
  io: MigrationIo = nodeMigrationIo,
): Promise<readonly Migration[]> => {
  const allFiles = await io.listFiles(directory);
  const sqlFiles = allFiles.filter((fileName) => fileName.toLowerCase().endsWith('.sql'));
  const parsed = await Promise.all(
    sqlFiles.map(async (fileName) => {
      const { version, description } = parseMigrationFileName(fileName);
      const sql = await io.readText(join(directory, fileName));
      if (sql.trim().length === 0) throw new Error(`Migration ${fileName} is empty.`);
      return { version, fileName, description, sql, checksum: migrationChecksum(sql) };
    }),
  );

  parsed.sort((left, right) => {
    const a = BigInt(left.version);
    const b = BigInt(right.version);
    return a < b ? -1 : a > b ? 1 : left.fileName.localeCompare(right.fileName);
  });

  const versions = new Set<string>();
  for (const migration of parsed) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version}.`);
    }
    versions.add(migration.version);
  }
  return parsed;
};

export const planMigrations = (
  local: readonly Migration[],
  database: readonly AppliedMigration[],
): MigrationPlan => {
  const localByVersion = new Map(local.map((migration) => [migration.version, migration]));
  const appliedVersions = new Set<string>();
  const applied: Migration[] = [];

  for (const record of database) {
    if (appliedVersions.has(record.version)) {
      throw new Error(`Database contains duplicate migration version ${record.version}.`);
    }
    appliedVersions.add(record.version);
    const migration = localByVersion.get(record.version);
    if (!migration) {
      throw new Error(`Applied migration ${record.version} (${record.fileName}) is missing locally.`);
    }
    if (migration.fileName !== record.fileName) {
      throw new Error(
        `Migration ${record.version} was renamed from ${record.fileName} to ${migration.fileName}.`,
      );
    }
    if (migration.checksum !== record.checksum) {
      throw new Error(`Checksum mismatch for applied migration ${migration.fileName}.`);
    }
    applied.push(migration);
  }

  const greatestAppliedVersion = database.reduce(
    (greatest, record) => (BigInt(record.version) > greatest ? BigInt(record.version) : greatest),
    0n,
  );
  const outOfOrder = local.find(
    (migration) =>
      !appliedVersions.has(migration.version) && BigInt(migration.version) < greatestAppliedVersion,
  );
  if (outOfOrder) {
    throw new Error(
      `Pending migration ${outOfOrder.fileName} is older than an already-applied migration.`,
    );
  }

  return {
    applied,
    pending: local.filter((migration) => !appliedVersions.has(migration.version)),
  };
};

const ensureMigrationTable = (client: PoolClient) =>
  client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version bigint PRIMARY KEY CHECK (version > 0),
      file_name text NOT NULL UNIQUE,
      checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now(),
      execution_ms integer NOT NULL CHECK (execution_ms >= 0)
    )
  `);

const readAppliedMigrations = async (client: PoolClient): Promise<readonly AppliedMigration[]> => {
  const result = await client.query<{
    version: string;
    file_name: string;
    checksum: string;
    applied_at: Date;
    execution_ms: number;
  }>(`
    SELECT version::text, file_name, checksum, applied_at, execution_ms
      FROM public.schema_migrations
     ORDER BY version
  `);
  return result.rows.map((row) => ({
    version: row.version,
    fileName: row.file_name,
    checksum: row.checksum,
    appliedAt: row.applied_at,
    executionMs: row.execution_ms,
  }));
};

export interface MigrationStatus {
  local: readonly Migration[];
  database: readonly AppliedMigration[];
  plan: MigrationPlan;
}

const underMigrationLock = async <T>(client: PoolClient, work: () => Promise<T>) => {
  await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [migrationLockName]);
  try {
    return await work();
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [migrationLockName]);
  }
};

export const inspectMigrations = async (
  pool: Pool,
  directory: string,
  io: MigrationIo = nodeMigrationIo,
): Promise<MigrationStatus> => {
  const local = await discoverMigrations(directory, io);
  const client = await pool.connect();
  try {
    return await underMigrationLock(client, async () => {
      await ensureMigrationTable(client);
      const database = await readAppliedMigrations(client);
      return { local, database, plan: planMigrations(local, database) };
    });
  } finally {
    client.release();
  }
};

export const runMigrations = async (
  pool: Pool,
  directory: string,
  io: MigrationIo = nodeMigrationIo,
): Promise<readonly Migration[]> => {
  const local = await discoverMigrations(directory, io);
  const client = await pool.connect();
  try {
    return await underMigrationLock(client, async () => {
      await ensureMigrationTable(client);
      const database = await readAppliedMigrations(client);
      const { pending } = planMigrations(local, database);
      const newlyApplied: Migration[] = [];

      for (const migration of pending) {
        const startedAt = performance.now();
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          const executionMs = Math.max(0, Math.round(performance.now() - startedAt));
          await client.query(
            `INSERT INTO public.schema_migrations
              (version, file_name, checksum, execution_ms)
             VALUES ($1::bigint, $2, $3, $4)`,
            [migration.version, migration.fileName, migration.checksum, executionMs],
          );
          await client.query('COMMIT');
          newlyApplied.push(migration);
        } catch (error) {
          try {
            await client.query('ROLLBACK');
          } catch {
            // Preserve the migration failure.
          }
          throw new Error(`Migration ${migration.fileName} failed.`, { cause: error });
        }
      }
      return newlyApplied;
    });
  } finally {
    client.release();
  }
};
