ALTER TABLE app.performance_imports
  ADD COLUMN rule_set_version_id uuid REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT;

ALTER TABLE app.performance_records
  ADD COLUMN rule_set_version_id uuid REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT;

UPDATE app.performance_imports import
   SET rule_set_version_id = COALESCE(
     (SELECT rules.id
        FROM app.rule_set_versions rules
       WHERE rules.effective_from <= import.previewed_at
         AND (rules.effective_to IS NULL OR rules.effective_to > import.previewed_at)
       ORDER BY rules.effective_from DESC LIMIT 1),
     (SELECT rules.id FROM app.rule_set_versions rules ORDER BY rules.effective_from DESC LIMIT 1)
   );

UPDATE app.performance_records record
   SET rule_set_version_id = COALESCE(
     (SELECT import.rule_set_version_id
        FROM app.performance_import_rows row
        JOIN app.performance_imports import ON import.id=row.import_id
       WHERE row.id=record.import_row_id),
     (SELECT rules.id
        FROM app.rule_set_versions rules
       WHERE rules.effective_from <= record.created_at
         AND (rules.effective_to IS NULL OR rules.effective_to > record.created_at)
       ORDER BY rules.effective_from DESC LIMIT 1),
     (SELECT rules.id FROM app.rule_set_versions rules ORDER BY rules.effective_from DESC LIMIT 1)
   );

ALTER TABLE app.performance_imports ALTER COLUMN rule_set_version_id SET NOT NULL;
ALTER TABLE app.performance_records ALTER COLUMN rule_set_version_id SET NOT NULL;

CREATE INDEX performance_imports_rule_set_idx ON app.performance_imports(rule_set_version_id);
CREATE INDEX performance_records_rule_set_idx ON app.performance_records(rule_set_version_id);
