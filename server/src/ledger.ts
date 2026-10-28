import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SparkType } from './domain.js';
import { conflict } from './errors.js';
import { one, rows } from './sql.js';

export type LedgerOperationType =
  | 'Grant'
  | 'Purchase'
  | 'Conversion'
  | 'Disenchant'
  | 'AdministrativeAdjustment'
  | 'Reversal'
  | 'Performance'
  | 'PeerRecognition'
  | 'Award'
  | 'InventoryEffect';

export interface LedgerPosting {
  employeeId: string;
  sparkType: SparkType;
  amount: number;
  entryKind: 'Credit' | 'Debit' | 'Fee' | 'Reversal';
  categoryVersionId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
  relatedEntryId?: number | null;
}

interface AccountRow {
  id: string;
  employee_id: string;
  spark_type: SparkType;
  balance: string | number;
}

export interface LedgerOperationInput {
  operationType: LedgerOperationType;
  actorUserId?: string | null;
  subjectEmployeeId?: string | null;
  ruleSetVersionId?: string | null;
  reversalOfOperationId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  requestId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
  entries: LedgerPosting[];
}

export const postLedgerOperation = async (db: PoolClient, input: LedgerOperationInput) => {
  if (input.entries.length === 0) throw new Error('A ledger operation requires at least one entry.');
  for (const entry of input.entries) {
    if (!Number.isSafeInteger(entry.amount) || entry.amount === 0)
      throw new Error('Ledger amounts must be non-zero safe integers.');
    if (entry.sparkType === 'Radiant' && entry.amount < 0)
      throw conflict('RADIANT_NOT_SPENDABLE', 'Radiant Sparks cannot be spent, converted or disenchanted.');
  }

  const accountKeys = Array.from(
    new Map(input.entries.map((entry) => [`${entry.employeeId}:${entry.sparkType}`, entry])).values(),
  ).sort((left, right) =>
    `${left.employeeId}:${left.sparkType}`.localeCompare(`${right.employeeId}:${right.sparkType}`),
  );
  for (const key of accountKeys) {
    await db.query(
      `INSERT INTO app.spark_accounts (employee_id, spark_type)
       VALUES ($1,$2) ON CONFLICT (employee_id, spark_type) DO NOTHING`,
      [key.employeeId, key.sparkType],
    );
  }
  const accounts = await rows<AccountRow>(
    db,
    `SELECT id, employee_id, spark_type, balance
       FROM app.spark_accounts
      WHERE (employee_id, spark_type) IN (
        SELECT * FROM unnest($1::uuid[], $2::text[])
      )
      ORDER BY employee_id, spark_type
      FOR UPDATE`,
    [accountKeys.map((entry) => entry.employeeId), accountKeys.map((entry) => entry.sparkType)],
  );
  const accountByKey = new Map(accounts.map((account) => [`${account.employee_id}:${account.spark_type}`, account]));
  const projected = new Map(accounts.map((account) => [account.id, Number(account.balance)]));
  for (const entry of input.entries) {
    const account = accountByKey.get(`${entry.employeeId}:${entry.sparkType}`);
    if (!account) throw new Error('Spark account could not be locked.');
    const next = (projected.get(account.id) ?? 0) + entry.amount;
    if (next < 0)
      throw conflict('INSUFFICIENT_SPARKS', `Not enough ${entry.sparkType} Sparks.`, {
        sparkType: entry.sparkType,
        available: projected.get(account.id) ?? 0,
        required: Math.abs(entry.amount),
      });
    projected.set(account.id, next);
  }

  const operationId = randomUUID();
  await db.query(
    `INSERT INTO app.spark_operations
      (id, operation_type, status, actor_user_id, subject_employee_id, rule_set_version_id,
       reversal_of_operation_id, source_type, source_id, request_id, description, metadata)
     VALUES ($1,$2,'Pending',$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
    [
      operationId,
      input.operationType,
      input.actorUserId ?? null,
      input.subjectEmployeeId ?? null,
      input.ruleSetVersionId ?? null,
      input.reversalOfOperationId ?? null,
      input.sourceType ?? null,
      input.sourceId ?? null,
      input.requestId ?? null,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const ledgerEntryIds: number[] = [];
  for (const entry of input.entries) {
    const account = accountByKey.get(`${entry.employeeId}:${entry.sparkType}`)!;
    const inserted = await one<{ id: string | number }>(
      db,
      `INSERT INTO app.spark_ledger_entries
        (operation_id, account_id, entry_kind, amount, balance_after, category_version_id,
         related_entry_id, source_type, source_id, description, metadata)
       VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING id`,
      [
        operationId,
        account.id,
        entry.entryKind,
        entry.amount,
        entry.categoryVersionId ?? null,
        entry.relatedEntryId ?? null,
        entry.sourceType,
        entry.sourceId ?? null,
        entry.description,
        JSON.stringify(entry.metadata ?? {}),
      ],
    );
    ledgerEntryIds.push(Number(inserted.id));
  }
  await db.query(
    `UPDATE app.spark_operations SET status='Committed', committed_at=clock_timestamp() WHERE id=$1`,
    [operationId],
  );
  return { operationId, ledgerEntryIds, balances: Object.fromEntries(projected) };
};

export const employeeBalances = async (db: PoolClient, employeeId: string) => {
  const result = await rows<{ spark_type: SparkType; balance: string | number }>(
    db,
    `SELECT spark_type, balance FROM app.spark_accounts WHERE employee_id=$1`,
    [employeeId],
  );
  const balances: Record<SparkType, number> = { White: 0, Yellow: 0, Blue: 0, Radiant: 0 };
  for (const row of result) balances[row.spark_type] = Number(row.balance);
  return balances;
};
