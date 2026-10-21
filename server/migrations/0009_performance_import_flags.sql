UPDATE app.performance_records current_record
SET metadata = jsonb_set(
  jsonb_set(
    current_record.metadata,
    '{KPIImported}',
    to_jsonb(EXISTS (
      SELECT 1
      FROM app.performance_records history
      JOIN app.performance_import_rows import_row ON import_row.id=history.import_row_id
      WHERE history.employee_id=current_record.employee_id
        AND history.period_start=current_record.period_start
        AND history.period_end=current_record.period_end
        AND import_row.normalized_data->>'kind'='KPI'
    )),
    true
  ),
  '{EvaluationImported}',
  to_jsonb(EXISTS (
    SELECT 1
    FROM app.performance_records history
    JOIN app.performance_import_rows import_row ON import_row.id=history.import_row_id
    WHERE history.employee_id=current_record.employee_id
      AND history.period_start=current_record.period_start
      AND history.period_end=current_record.period_end
      AND import_row.normalized_data->>'kind'='Evaluation'
  )),
  true
)
WHERE current_record.source_type='CsvImport';

UPDATE app.roles
SET description=CASE code
  WHEN 'GPM' THEN 'Managed-team access, White and Yellow award requests, Radiant-only personal Ledger and company achievements.'
  WHEN 'Head' THEN 'Department approvals, direct awards, Radiant-only personal Ledger and company achievements.'
  WHEN 'Top Management' THEN 'Radiant Award, Radiant-only personal Ledger, company achievements and read-only shop access.'
  ELSE description
END
WHERE code IN ('GPM','Head','Top Management');
