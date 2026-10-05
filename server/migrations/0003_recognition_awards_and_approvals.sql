CREATE TABLE app.quality_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Cancelled', 'Expired')),
  created_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  CHECK (ends_on >= starts_on),
  CHECK (
    (status = 'Cancelled' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
    OR status <> 'Cancelled'
  )
);

ALTER TABLE app.quality_gates
  ADD CONSTRAINT quality_gates_no_active_overlap
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(starts_on, ends_on, '[]') WITH &&
  ) WHERE (status = 'Active');

CREATE TABLE app.recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nominator_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  recipient_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  recipient_department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  category_version_id uuid NOT NULL REFERENCES app.spark_category_versions(id) ON DELETE RESTRICT,
  rule_set_version_id uuid NOT NULL REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled', 'BlockedByQualityGate')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  rejection_reason text,
  quality_gate_id uuid REFERENCES app.quality_gates(id) ON DELETE RESTRICT,
  operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (nominator_employee_id <> recipient_employee_id),
  CHECK ((status = 'Pending' AND decided_at IS NULL) OR (status <> 'Pending' AND decided_at IS NOT NULL)),
  CHECK (status <> 'Rejected' OR (rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0)),
  CHECK (status <> 'BlockedByQualityGate' OR quality_gate_id IS NOT NULL)
);

CREATE TABLE app.award_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  recipient_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  recipient_department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  category_version_id uuid REFERENCES app.spark_category_versions(id) ON DELETE RESTRICT,
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue', 'Radiant')),
  spark_amount bigint NOT NULL CHECK (spark_amount > 0),
  rule_set_version_id uuid NOT NULL REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 4000),
  is_direct boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Cancelled', 'BlockedByQualityGate')),
  quota_period_start date NOT NULL,
  quota_period_end date NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  rejection_reason text,
  quality_gate_id uuid REFERENCES app.quality_gates(id) ON DELETE RESTRICT,
  operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (quota_period_end >= quota_period_start),
  CHECK ((status = 'Pending' AND decided_at IS NULL) OR (status <> 'Pending' AND decided_at IS NOT NULL)),
  CHECK (status <> 'Rejected' OR (rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0)),
  CHECK (status <> 'BlockedByQualityGate' OR quality_gate_id IS NOT NULL),
  CHECK (NOT is_direct OR status <> 'Pending'),
  CHECK (category_version_id IS NOT NULL OR (spark_type = 'Radiant' AND spark_amount = 1))
);

CREATE TABLE app.quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('Recognition', 'Award')),
  subject_id uuid NOT NULL,
  owner_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES app.spark_categories(id) ON DELETE RESTRICT,
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue', 'Radiant')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'Reserved' CHECK (status IN ('Reserved', 'Consumed', 'Released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (subject_type, subject_id),
  CHECK (period_end >= period_start),
  CHECK ((status = 'Reserved' AND resolved_at IS NULL) OR (status <> 'Reserved' AND resolved_at IS NOT NULL))
);

CREATE TABLE app.approval_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('Recognition', 'Award', 'Disenchant', 'AccessRequest')),
  subject_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('Submitted', 'Approved', 'Rejected', 'Cancelled', 'Exported', 'Paid')),
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  reason text,
  previous_status text,
  resulting_status text NOT NULL,
  rule_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(rule_snapshot) = 'object'),
  request_id text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (action <> 'Rejected' OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);

CREATE INDEX quality_gates_department_dates_idx
  ON app.quality_gates(department_id, starts_on, ends_on) WHERE status = 'Active';
CREATE INDEX quality_gates_employee_dates_idx
  ON app.quality_gates(employee_id, starts_on, ends_on) WHERE status = 'Active';
CREATE INDEX recognitions_nominator_time_idx
  ON app.recognitions(nominator_employee_id, requested_at DESC);
CREATE INDEX recognitions_recipient_time_idx
  ON app.recognitions(recipient_employee_id, requested_at DESC);
CREATE INDEX recognitions_approval_queue_idx
  ON app.recognitions(recipient_department_id, requested_at) WHERE status = 'Pending';
CREATE INDEX award_requests_requester_time_idx
  ON app.award_requests(requested_by_employee_id, requested_at DESC);
CREATE INDEX award_requests_recipient_time_idx
  ON app.award_requests(recipient_employee_id, requested_at DESC);
CREATE INDEX award_requests_approval_queue_idx
  ON app.award_requests(recipient_department_id, requested_at) WHERE status = 'Pending';
CREATE INDEX quota_reservations_usage_idx
  ON app.quota_reservations(owner_employee_id, spark_type, period_start, period_end, status);
CREATE INDEX approval_actions_subject_idx
  ON app.approval_actions(subject_type, subject_id, created_at DESC);

CREATE TRIGGER approval_actions_immutable
  BEFORE UPDATE OR DELETE ON app.approval_actions
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
