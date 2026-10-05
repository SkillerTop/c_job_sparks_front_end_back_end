CREATE TABLE app.performance_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_name text NOT NULL,
  file_sha256 char(64) NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'Previewed'
    CHECK (status IN ('Previewed', 'Invalid', 'Committed', 'Cancelled')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  uploaded_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  previewed_at timestamptz NOT NULL DEFAULT now(),
  committed_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  committed_at timestamptz,
  CHECK (valid_rows + invalid_rows = total_rows),
  CHECK ((status = 'Committed' AND committed_at IS NOT NULL AND invalid_rows = 0) OR status <> 'Committed')
);

CREATE UNIQUE INDEX performance_imports_committed_file_unique
  ON app.performance_imports(file_sha256) WHERE status = 'Committed';

CREATE TABLE app.performance_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES app.performance_imports(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  raw_data jsonb NOT NULL CHECK (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb CHECK (normalized_data IS NULL OR jsonb_typeof(normalized_data) = 'object'),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  is_valid boolean NOT NULL,
  employee_id uuid REFERENCES app.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, row_number),
  CHECK (is_valid = (jsonb_array_length(validation_errors) = 0))
);

CREATE TABLE app.performance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  kpis jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(kpis) = 'array'),
  personal_cards jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(personal_cards) = 'array'),
  score numeric(12,4),
  proposed_white_amount bigint NOT NULL DEFAULT 0 CHECK (proposed_white_amount >= 0),
  status text NOT NULL DEFAULT 'Recorded'
    CHECK (status IN ('Recorded', 'Awarded', 'BlockedByQualityGate', 'Superseded')),
  source_type text NOT NULL CHECK (source_type IN ('Manual', 'CsvImport')),
  import_row_id uuid UNIQUE REFERENCES app.performance_import_rows(id) ON DELETE RESTRICT,
  quality_gate_id uuid REFERENCES app.quality_gates(id) ON DELETE RESTRICT,
  operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_by_record_id uuid UNIQUE REFERENCES app.performance_records(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (period_end >= period_start),
  CHECK (
    (source_type = 'CsvImport' AND import_row_id IS NOT NULL)
    OR (source_type = 'Manual' AND import_row_id IS NULL)
  ),
  CHECK (status <> 'BlockedByQualityGate' OR quality_gate_id IS NOT NULL),
  CHECK (status <> 'Awarded' OR operation_id IS NOT NULL),
  CHECK (superseded_by_record_id IS NULL OR superseded_by_record_id <> id)
);

CREATE UNIQUE INDEX performance_records_current_period_unique
  ON app.performance_records(employee_id, period_start, period_end)
  WHERE status <> 'Superseded';

CREATE TABLE app.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  achievement_type text NOT NULL CHECK (achievement_type IN (
    'PeerRecognition', 'Award', 'Performance', 'Company', 'PersonalCard'
  )),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 250),
  description text,
  spark_type text CHECK (spark_type IN ('White', 'Yellow', 'Blue', 'Radiant')),
  spark_amount bigint CHECK (spark_amount IS NULL OR spark_amount > 0),
  category_version_id uuid REFERENCES app.spark_category_versions(id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  quality_gate_id uuid REFERENCES app.quality_gates(id) ON DELETE RESTRICT,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  period_start date,
  period_end date,
  awarded_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (source_type, source_id),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK ((spark_type IS NULL AND spark_amount IS NULL) OR (spark_type IS NOT NULL AND spark_amount IS NOT NULL))
);

CREATE TABLE app.conversion_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  rule_set_version_id uuid NOT NULL REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT,
  from_spark_type text NOT NULL CHECK (from_spark_type IN ('White', 'Yellow')),
  to_spark_type text NOT NULL CHECK (to_spark_type IN ('Yellow', 'Blue')),
  input_amount bigint NOT NULL CHECK (input_amount > 0),
  fee_amount bigint NOT NULL CHECK (fee_amount >= 0),
  output_amount bigint NOT NULL CHECK (output_amount > 0),
  spark_operation_id uuid NOT NULL UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (from_spark_type = 'White' AND to_spark_type = 'Yellow')
    OR (from_spark_type = 'Yellow' AND to_spark_type = 'Blue')
  )
);

CREATE TABLE app.disenchant_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  rule_set_version_id uuid NOT NULL REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT,
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue')),
  spark_amount bigint NOT NULL CHECK (spark_amount > 0),
  rate_snapshot numeric(18,6) NOT NULL CHECK (rate_snapshot > 0),
  money_amount numeric(18,2) NOT NULL CHECK (money_amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  department_snapshot jsonb NOT NULL CHECK (jsonb_typeof(department_snapshot) = 'object'),
  status text NOT NULL DEFAULT 'Created' CHECK (status IN ('Created', 'Exported', 'Paid', 'Cancelled')),
  debit_operation_id uuid NOT NULL UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  cancellation_operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  exported_at timestamptz,
  export_reference text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  status_changed_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  CHECK ((status <> 'Exported') OR (exported_at IS NOT NULL AND export_reference IS NOT NULL)),
  CHECK ((status <> 'Paid') OR paid_at IS NOT NULL),
  CHECK (
    (status = 'Cancelled' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL
      AND cancellation_operation_id IS NOT NULL)
    OR status <> 'Cancelled'
  )
);

CREATE INDEX performance_import_rows_import_idx ON app.performance_import_rows(import_id, row_number);
CREATE INDEX performance_records_employee_period_idx
  ON app.performance_records(employee_id, period_start DESC, period_end DESC);
CREATE INDEX achievements_employee_time_idx ON app.achievements(employee_id, occurred_at DESC);
CREATE INDEX achievements_company_time_idx
  ON app.achievements(occurred_at DESC) WHERE achievement_type = 'Company';
CREATE INDEX conversion_operations_employee_time_idx
  ON app.conversion_operations(employee_id, created_at DESC);
CREATE INDEX disenchant_requests_employee_time_idx
  ON app.disenchant_requests(employee_id, created_at DESC);
CREATE INDEX disenchant_requests_department_queue_idx
  ON app.disenchant_requests(department_id, status, created_at DESC);

CREATE TRIGGER achievements_immutable
  BEFORE UPDATE OR DELETE ON app.achievements
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
