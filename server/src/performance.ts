import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal } from './domain.js';
import { createNotification, enqueueOutbox, writeAudit } from './audit.js';
import { badRequest, conflict, notFound } from './errors.js';
import { effectiveRuleSet } from './economy.js';
import { postLedgerOperation } from './ledger.js';
import {
  performanceRewardFor,
  performanceThresholdsFromConfiguration,
  type PerformanceImportKind,
} from './performance-rules.js';
import { maybeOne, one, rows } from './sql.js';

type ImportKind = PerformanceImportKind;

const parseCsv = (text: string) => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  // Prefer explicit semicolon/pipe separators. A trailing decimal comma in exports such as
  // `Resource;Efficiency,` must not be mistaken for the column delimiter.
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('|') ? '|' : ',';
  const output: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      row.push(value.trim());
      value = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim());
      value = '';
      while (row.at(-1) === '') row.pop();
      if (row.some((cell) => cell.replace(/[\s,]/g, '').length > 0)) output.push(row);
      row = [];
    } else value += character;
  }
  if (quoted) throw badRequest('INVALID_CSV', 'The CSV contains an unterminated quoted field.');
  row.push(value.trim());
  while (row.at(-1) === '') row.pop();
  if (row.some((cell) => cell.replace(/[\s,]/g, '').length > 0)) output.push(row);
  return output;
};

const identityKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const quarterDates = (quarter: string) => {
  const match = /^Q([1-4]) (\d{4})$/.exec(quarter);
  if (!match) throw badRequest('INVALID_QUARTER', 'Quarter must use the format Q1 2026.');
  const quarterNumber = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = (quarterNumber - 1) * 3;
  const periodStart = new Date(Date.UTC(year, startMonth, 1)).toISOString().slice(0, 10);
  const periodEnd = new Date(Date.UTC(year, startMonth + 3, 0)).toISOString().slice(0, 10);
  return { periodStart, periodEnd };
};

interface PreviewRow {
  lineNumber: number;
  employeeId?: string;
  employee: string;
  value: number | string;
  reward: number;
  status: 'Ready' | 'Blocked' | 'Invalid' | 'Unknown';
  error?: string;
}

export const previewPerformanceCsv = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  kind: ImportKind,
  quarter: string,
  fileName: string,
  contents: Buffer,
) => {
  if (!fileName.toLowerCase().endsWith('.csv')) throw badRequest('INVALID_FILE_TYPE', 'Choose a CSV file.');
  const { periodStart, periodEnd } = quarterDates(quarter);
  const ruleSet = await effectiveRuleSet(db);
  const performanceThresholds = performanceThresholdsFromConfiguration(ruleSet.configuration);
  const table = parseCsv(contents.toString('utf8').replace(/^\uFEFF/, ''));
  if (table.length < 2) throw badRequest('EMPTY_CSV', 'The CSV must contain a header and at least one data row.');
  const headers = table[0]!.map((header) => header.toLowerCase().replace(/[^a-z]/g, ''));
  const employeeColumn = headers.findIndex((header) => ['name', 'employee', 'employeeid', 'email', 'resource'].includes(header));
  const valueColumn = headers.findIndex((header) =>
    kind === 'KPI'
      ? ['kpi', 'efficiency'].includes(header)
      : ['averagequartermark', 'evaluation', 'personalcards', 'personalcardsreward'].includes(header)
        || header.endsWith('personalcards'),
  );
  if (employeeColumn < 0 || valueColumn < 0)
    throw badRequest('INVALID_CSV_HEADERS', `Expected Name (or Email) and ${kind === 'KPI' ? 'KPI' : 'Average Quarter Mark'} columns.`);

  const employees = await rows<{ id: string; display_name: string; contact_email: string | null; user_email: string | null }>(
    db,
    `SELECT e.id,e.display_name,e.contact_email,u.email::text AS user_email
       FROM app.employees e LEFT JOIN app.users u ON u.id=e.user_id WHERE e.is_active`,
  );
  const employeeByIdentity = new Map<string, (typeof employees)[number]>();
  for (const employee of employees) {
    for (const identity of [employee.id, employee.display_name, employee.contact_email, employee.user_email])
      if (identity) employeeByIdentity.set(identityKey(identity), employee);
  }
  const seen = new Set<string>();
  const previewRows: PreviewRow[] = [];
  for (const [index, cells] of table.slice(1).entries()) {
    const identity = (cells[employeeColumn] ?? '').trim();
    const rawValue = (cells[valueColumn] ?? '').trim();
    const employee = employeeByIdentity.get(identityKey(identity));
    const normalizedValue = /^\d+,$/.test(rawValue) ? rawValue.slice(0, -1) : rawValue;
    const numericValue = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(normalizedValue)
      ? Number(normalizedValue.replace(',', '.'))
      : Number.NaN;
    const common = {
      lineNumber: index + 2,
      ...(employee ? { employeeId: employee.id } : {}),
      employee: employee?.display_name ?? (identity || 'Missing employee'),
      value: Number.isFinite(numericValue) ? numericValue : rawValue,
      reward: 0,
    };
    if (cells.length !== headers.length) {
      previewRows.push({ ...common, status: 'Invalid', error: `Expected ${headers.length} columns but found ${cells.length}.` });
      continue;
    }
    if (!employee) {
      previewRows.push({ ...common, status: 'Unknown', error: 'No active employee matches this name, email or ID.' });
      continue;
    }
    if (seen.has(employee.id)) {
      previewRows.push({ ...common, status: 'Invalid', error: 'This employee occurs more than once in the file.' });
      continue;
    }
    seen.add(employee.id);
    if (!Number.isFinite(numericValue) || numericValue < 0 || (kind === 'Evaluation' && numericValue > 5)) {
      previewRows.push({
        ...common,
        status: 'Invalid',
        error: kind === 'KPI' ? 'KPI must be a non-negative number.' : 'Personal cards score must be between 0 and 5.',
      });
      continue;
    }
    const gate = await maybeOne<{ id: string }>(db, `SELECT id FROM app.quality_gates
      WHERE employee_id=$1 AND status='Active' AND starts_on<=CURRENT_DATE AND ends_on>=CURRENT_DATE LIMIT 1`, [employee.id]);
    const calculatedReward = performanceRewardFor(kind, numericValue, performanceThresholds);
    const reward = gate ? 0 : calculatedReward;
    previewRows.push({
      ...common,
      value: numericValue,
      reward,
      status: gate ? 'Blocked' : 'Ready',
      ...(gate ? { error: 'Active Quality Gate: performance is stored, White credit is blocked.' } : {}),
    });
  }

  const duplicate = await one<{ value: boolean }>(db, `SELECT EXISTS (
    SELECT 1 FROM app.performance_records record
    LEFT JOIN app.performance_import_rows source_row ON source_row.id=record.import_row_id
    WHERE record.period_start=$1 AND record.period_end=$2 AND record.status<>'Superseded'
      AND (
        record.metadata->>($3 || 'Imported')='true'
        OR (
          NOT (record.metadata ? 'KPIImported')
          AND NOT (record.metadata ? 'EvaluationImported')
          AND source_row.normalized_data->>'kind'=$3
        )
      )
  ) AS value`, [periodStart, periodEnd, kind]);
  const id = randomUUID();
  const errors = previewRows.filter((row) => row.status === 'Invalid' || row.status === 'Unknown').map((row) => ({
    lineNumber: row.lineNumber, error: row.error,
  }));
  await db.query(`INSERT INTO app.performance_imports
    (id,original_file_name,file_sha256,status,total_rows,valid_rows,invalid_rows,validation_errors,
     uploaded_by_user_id,rule_set_version_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`, [
    id, fileName, createHash('sha256').update(contents).digest('hex'), errors.length ? 'Invalid' : 'Previewed',
    previewRows.length, previewRows.length - errors.length, errors.length, JSON.stringify(errors), principal.userId,
    ruleSet.id,
  ]);
  const importRows = previewRows.map((row) => {
    const validationErrors = row.error && ['Invalid', 'Unknown'].includes(row.status) ? [row.error] : [];
    return {
      rowNumber: row.lineNumber,
      rawData: { identity: row.employee, value: row.value },
      normalizedData: {
        kind, quarter, periodStart, periodEnd, employee: row.employee, value: row.value,
        reward: row.reward,
        calculatedReward: typeof row.value === 'number'
          ? performanceRewardFor(kind, row.value, performanceThresholds)
          : 0,
        ruleSetVersionId: ruleSet.id,
        status: row.status,
      },
      validationErrors,
      isValid: validationErrors.length === 0,
      employeeId: row.employeeId ?? null,
    };
  });
  await db.query(`INSERT INTO app.performance_import_rows
    (import_id,row_number,raw_data,normalized_data,validation_errors,is_valid,employee_id)
    SELECT $1,value.row_number,value.raw_data,value.normalized_data,value.validation_errors,
           value.is_valid,value.employee_id
      FROM jsonb_to_recordset($2::jsonb) AS value(
        row_number integer,
        raw_data jsonb,
        normalized_data jsonb,
        validation_errors jsonb,
        is_valid boolean,
        employee_id uuid
      )`, [id, JSON.stringify(importRows.map((row) => ({
        row_number: row.rowNumber,
        raw_data: row.rawData,
        normalized_data: row.normalizedData,
        validation_errors: row.validationErrors,
        is_valid: row.isValid,
        employee_id: row.employeeId,
      })))]);
  return {
    id, kind, quarter, fileName,
    employeesFound: previewRows.filter((row) => row.employeeId).length,
    employeesNotFound: previewRows.filter((row) => row.status === 'Unknown').length,
    invalidValues: previewRows.filter((row) => row.status === 'Invalid').length,
    qualityGateActive: previewRows.filter((row) => row.status === 'Blocked').length,
    expectedWhiteSparks: previewRows.reduce((total, row) => total + row.reward, 0),
    duplicate: duplicate.value,
    rows: previewRows,
  };
};

export const commitPerformanceImport = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  importId: string,
  replace: boolean,
  requestId: string,
) => {
  const performanceImport = await maybeOne<any>(db, `SELECT * FROM app.performance_imports WHERE id=$1 FOR UPDATE`, [importId]);
  if (!performanceImport) throw notFound('Performance import');
  if (performanceImport.status === 'Committed') throw conflict('IMPORT_ALREADY_COMMITTED', 'This file was already imported.');
  if (performanceImport.status !== 'Previewed' || Number(performanceImport.invalid_rows) > 0)
    throw conflict('IMPORT_HAS_ERRORS', 'Resolve all blocking import errors before confirmation.');
  const importRows = await rows<any>(db, `SELECT * FROM app.performance_import_rows WHERE import_id=$1 ORDER BY row_number FOR UPDATE`, [importId]);
  for (const importRow of importRows) {
    const normalized = importRow.normalized_data as Record<string, unknown>;
    const kind = normalized.kind as ImportKind;
    const periodStart = String(normalized.periodStart);
    const periodEnd = String(normalized.periodEnd);
    const value = Number(normalized.value);
    const employeeId = String(importRow.employee_id);
    const current = await maybeOne<any>(db, `SELECT record.*,
        source_row.normalized_data->>'kind' AS imported_kind
      FROM app.performance_records record
      LEFT JOIN app.performance_import_rows source_row ON source_row.id=record.import_row_id
      WHERE record.employee_id=$1 AND record.period_start=$2 AND record.period_end=$3
        AND record.status<>'Superseded' FOR UPDATE OF record`,
    [employeeId, periodStart, periodEnd]);
    const currentMetadata = (current?.metadata ?? {}) as Record<string, unknown>;
    const importedFlag = `${kind}Imported`;
    const alreadyImported = currentMetadata[importedFlag] === true ||
      (currentMetadata.KPIImported === undefined && currentMetadata.EvaluationImported === undefined && current?.imported_kind === kind);
    if (alreadyImported && !replace)
      throw conflict('PERFORMANCE_ALREADY_IMPORTED', `${normalized.employee as string} already has ${kind} data for this quarter.`);

    let kpiValue = kind === 'KPI' ? value : Number(currentMetadata.KPI ?? 0);
    let evaluationValue = kind === 'Evaluation' ? value : Number(currentMetadata.Evaluation ?? 0);
    if (!Number.isFinite(kpiValue)) kpiValue = 0;
    if (!Number.isFinite(evaluationValue)) evaluationValue = 0;
    const importedReward = Number(normalized.calculatedReward ?? normalized.reward);
    const kpiReward = kind === 'KPI' ? importedReward : Number(currentMetadata.KPIReward ?? 0);
    const evaluationReward = kind === 'Evaluation' ? importedReward : Number(currentMetadata.EvaluationReward ?? 0);
    const proposedReward = kpiReward + evaluationReward;
    const gate = await maybeOne<{ id: string }>(db, `SELECT id FROM app.quality_gates
      WHERE employee_id=$1 AND status='Active' AND starts_on<=CURRENT_DATE AND ends_on>=CURRENT_DATE LIMIT 1`, [employeeId]);

    if (current?.operation_id) {
      const entries = await rows<{ id: number; amount: string | number }>(db, `SELECT le.id,le.amount
        FROM app.spark_ledger_entries le WHERE le.operation_id=$1 ORDER BY le.id FOR UPDATE`, [current.operation_id]);
      await postLedgerOperation(db, {
        operationType: 'Reversal', actorUserId: principal.userId, subjectEmployeeId: employeeId,
        reversalOfOperationId: current.operation_id, sourceType: 'PerformanceImportReplacement', sourceId: importId,
        requestId, description: `Reverse superseded performance reward for ${normalized.quarter as string}`,
        entries: entries.map((entry) => ({ employeeId, sparkType: 'White', amount: -Number(entry.amount),
          entryKind: 'Reversal', relatedEntryId: entry.id, sourceType: 'PerformanceImportReplacement',
          sourceId: importId, description: 'Performance import replacement reversal.' })),
      });
    }
    if (current) await db.query(`UPDATE app.performance_records SET status='Superseded' WHERE id=$1`, [current.id]);

    const recordId = randomUUID();
    let operationId: string | null = null;
    const status = gate ? 'BlockedByQualityGate' : proposedReward > 0 ? 'Awarded' : 'Recorded';
    if (!gate && proposedReward > 0) {
      const operation = await postLedgerOperation(db, {
        operationType: 'Performance', actorUserId: principal.userId, subjectEmployeeId: employeeId,
        sourceType: 'PerformanceRecord', sourceId: recordId, requestId,
        description: `Performance reward for ${normalized.quarter as string}`,
        entries: [{ employeeId, sparkType: 'White', amount: proposedReward, entryKind: 'Credit',
          sourceType: 'PerformanceRecord', sourceId: recordId,
          description: `Performance reward for ${normalized.quarter as string}` }],
      });
      operationId = operation.operationId;
    }
    await db.query(`INSERT INTO app.performance_records
      (id,employee_id,period_start,period_end,kpis,personal_cards,score,proposed_white_amount,status,source_type,
       import_row_id,quality_gate_id,operation_id,created_by_user_id,metadata,rule_set_version_id)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,'CsvImport',$10,$11,$12,$13,$14::jsonb,$15)`, [
      recordId, employeeId, periodStart, periodEnd, JSON.stringify([{ name: 'KPI', value: kpiValue }]),
      JSON.stringify([{ name: 'Average Quarter Mark', value: evaluationValue }]),
      kind === 'KPI' ? kpiValue : evaluationValue, proposedReward, status, importRow.id, gate?.id ?? null,
      operationId, principal.userId, JSON.stringify({ KPI: kpiValue, KPIReward: kpiReward,
        KPIImported: kind === 'KPI' || currentMetadata.KPIImported === true || current?.imported_kind === 'KPI',
        Evaluation: evaluationValue, EvaluationReward: evaluationReward,
        EvaluationImported: kind === 'Evaluation' || currentMetadata.EvaluationImported === true || current?.imported_kind === 'Evaluation',
        quarter: normalized.quarter }), performanceImport.rule_set_version_id,
    ]);
    if (current) await db.query(`UPDATE app.performance_records SET superseded_by_record_id=$2 WHERE id=$1`, [current.id, recordId]);
    await db.query(`INSERT INTO app.achievements
      (employee_id,achievement_type,title,description,spark_type,spark_amount,operation_id,quality_gate_id,
       source_type,source_id,period_start,period_end,awarded_by_user_id)
      VALUES ($1,'Performance',$2,$3,$4,$5,$6,$7,'PerformanceRecord',$8,$9,$10,$11)`, [
      employeeId, `Performance · ${normalized.quarter as string}`,
      gate ? 'Performance stored; White reward blocked by an active Quality Gate.' : 'Quarterly performance imported.',
      proposedReward > 0 ? 'White' : null, proposedReward > 0 ? proposedReward : null, operationId, gate?.id ?? null,
      recordId, periodStart, periodEnd, principal.userId,
    ]);
    const owner = await maybeOne<{ user_id: string }>(db,
      `SELECT user_id FROM app.employees WHERE id=$1 AND user_id IS NOT NULL`, [employeeId]);
    if (owner) await createNotification(
      db,
      owner.user_id,
      gate ? 'System' : 'SparksCredited',
      gate ? 'Performance recorded' : 'Performance reward recorded',
      gate
        ? `${normalized.quarter as string} performance was stored; the White reward is blocked by a Quality Gate.`
        : `${normalized.quarter as string} performance was imported with ${proposedReward} White Sparks.`,
      'PerformanceRecord',
      recordId,
    );
    await enqueueOutbox(db, 'PerformanceRecorded', 'PerformanceRecord', recordId, {
      employeeId, importId, kind, status, proposedReward, operationId,
    });
    await writeAudit(db, {
      actorUserId: principal.userId,
      action: 'PERFORMANCE_IMPORTED',
      objectType: 'PerformanceRecord',
      objectId: recordId,
      after: { employeeId, importId, kind, status, proposedReward },
      requestId,
    });
  }
  await db.query(`UPDATE app.performance_imports SET status='Committed',committed_by_user_id=$2,
    committed_at=clock_timestamp() WHERE id=$1`, [importId, principal.userId]);
  await enqueueOutbox(db, 'PerformanceImportCommitted', 'PerformanceImport', importId, {
    importedRows: importRows.length, replace,
  });
  await writeAudit(db, {
    actorUserId: principal.userId,
    action: 'PERFORMANCE_IMPORT_COMMITTED',
    objectType: 'PerformanceImport',
    objectId: importId,
    after: { importedRows: importRows.length, replace },
    requestId,
  });
  return { id: importId, status: 'Committed', importedRows: importRows.length };
};
