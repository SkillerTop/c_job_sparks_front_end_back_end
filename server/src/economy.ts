import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal, SparkType, SpendableSparkType } from './domain.js';
import { canUseMemberEconomy } from './domain.js';
import { badRequest, forbidden, notFound } from './errors.js';
import { postLedgerOperation } from './ledger.js';
import { one } from './sql.js';

interface RuleSetRow {
  id: string;
  white_to_yellow_input: string | number;
  white_to_yellow_output: string | number;
  white_to_yellow_fee: string | number;
  yellow_to_blue_input: string | number;
  yellow_to_blue_output: string | number;
  yellow_to_blue_fee: string | number;
  peer_quarterly_limit: string | number;
  yellow_quarterly_limit: string | number;
  coordinator_team_multiplier: string | number;
  disenchant_currency: string;
  white_disenchant_rate: string | number;
  yellow_disenchant_rate: string | number;
  blue_disenchant_rate: string | number;
}

export const effectiveRuleSet = async (db: PoolClient) => {
  const result = await db.query<RuleSetRow>(
    `SELECT * FROM app.rule_set_versions
      WHERE status='Active'
        AND effective_from <= clock_timestamp()
        AND (effective_to IS NULL OR effective_to > clock_timestamp())
      ORDER BY effective_from DESC LIMIT 1`,
  );
  if (!result.rows[0]) throw notFound('Active rule set');
  return result.rows[0];
};

export const convertSparks = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  from: SparkType,
  amount: number,
  requestId: string,
) => {
  if (!canUseMemberEconomy(principal.role)) throw forbidden();
  const rule = await effectiveRuleSet(db);
  const conversion =
    from === 'White'
      ? {
          to: 'Yellow' as const,
          input: Number(rule.white_to_yellow_input),
          outputPerBundle: Number(rule.white_to_yellow_output),
          feePerBundle: Number(rule.white_to_yellow_fee),
        }
      : from === 'Yellow'
        ? {
            to: 'Blue' as const,
            input: Number(rule.yellow_to_blue_input),
            outputPerBundle: Number(rule.yellow_to_blue_output),
            feePerBundle: Number(rule.yellow_to_blue_fee),
          }
        : null;
  if (!conversion) throw badRequest('INVALID_CONVERSION', 'Only White to Yellow and Yellow to Blue are allowed.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount % conversion.input !== 0)
    throw badRequest('INVALID_AMOUNT', `Amount must be a positive multiple of ${conversion.input}.`);
  const bundles = amount / conversion.input;
  const output = bundles * conversion.outputPerBundle;
  const fee = bundles * conversion.feePerBundle;
  const conversionId = randomUUID();
  const entries = [
    {
      employeeId: principal.employeeId,
      sparkType: from,
      amount: -amount,
      entryKind: 'Debit' as const,
      sourceType: 'Conversion',
      sourceId: conversionId,
      description: `${from} conversion principal.`,
    },
    ...(fee > 0
      ? [
          {
            employeeId: principal.employeeId,
            sparkType: from,
            amount: -fee,
            entryKind: 'Fee' as const,
            sourceType: 'Conversion',
            sourceId: conversionId,
            description: `${from} conversion fee.`,
          },
        ]
      : []),
    {
      employeeId: principal.employeeId,
      sparkType: conversion.to,
      amount: output,
      entryKind: 'Credit' as const,
      sourceType: 'Conversion',
      sourceId: conversionId,
      description: `Received from ${from} conversion.`,
    },
  ];
  const ledger = await postLedgerOperation(db, {
    operationType: 'Conversion',
    actorUserId: principal.userId,
    subjectEmployeeId: principal.employeeId,
    ruleSetVersionId: rule.id,
    sourceType: 'Conversion',
    sourceId: conversionId,
    requestId,
    description: `${amount + fee} ${from} converted to ${output} ${conversion.to}.`,
    entries,
  });
  await db.query(
    `INSERT INTO app.conversion_operations
      (id, employee_id, rule_set_version_id, from_spark_type, to_spark_type,
       input_amount, fee_amount, output_amount, spark_operation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [conversionId, principal.employeeId, rule.id, from, conversion.to, amount, fee, output, ledger.operationId],
  );
  return { id: conversionId, output, to: conversion.to, fee, totalDebited: amount + fee };
};

export const createDisenchantRequest = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  sparkType: SpendableSparkType,
  amount: number,
  requestId: string,
) => {
  if (!canUseMemberEconomy(principal.role)) throw forbidden();
  if (!['White', 'Yellow', 'Blue'].includes(sparkType))
    throw badRequest('RADIANT_NOT_SPENDABLE', 'Radiant Sparks cannot be disenchanted.');
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw badRequest('INVALID_AMOUNT', 'Amount must be a positive whole number.');
  const rule = await effectiveRuleSet(db);
  const rate = Number(
    sparkType === 'White'
      ? rule.white_disenchant_rate
      : sparkType === 'Yellow'
        ? rule.yellow_disenchant_rate
        : rule.blue_disenchant_rate,
  );
  const moneyAmount = Math.round(amount * rate * 100) / 100;
  const department = await one<{ id: string; code: string; name: string }>(
    db,
    `SELECT id, code, name FROM app.departments WHERE id=$1 AND is_active`,
    [principal.departmentId],
  );
  const disenchantId = randomUUID();
  const ledger = await postLedgerOperation(db, {
    operationType: 'Disenchant',
    actorUserId: principal.userId,
    subjectEmployeeId: principal.employeeId,
    ruleSetVersionId: rule.id,
    sourceType: 'Disenchant',
    sourceId: disenchantId,
    requestId,
    description: `Disenchant request for ${amount} ${sparkType}.`,
    entries: [
      {
        employeeId: principal.employeeId,
        sparkType,
        amount: -amount,
        entryKind: 'Debit',
        sourceType: 'Disenchant',
        sourceId: disenchantId,
        description: 'Sparks reserved for a payout request.',
      },
    ],
  });
  const created = await one<Record<string, unknown>>(
    db,
    `INSERT INTO app.disenchant_requests
      (id, employee_id, department_id, rule_set_version_id, spark_type, spark_amount,
       rate_snapshot, money_amount, currency, department_snapshot, debit_operation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
     RETURNING *`,
    [
      disenchantId,
      principal.employeeId,
      principal.departmentId,
      rule.id,
      sparkType,
      amount,
      rate,
      moneyAmount,
      rule.disenchant_currency,
      JSON.stringify(department),
      ledger.operationId,
    ],
  );
  return created;
};
