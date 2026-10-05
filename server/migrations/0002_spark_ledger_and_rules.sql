CREATE TABLE app.spark_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue', 'Radiant')),
  usage_type text NOT NULL CHECK (usage_type IN ('PeerRecognition', 'Award', 'Performance', 'Administrative')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.spark_category_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES app.spark_categories(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text,
  amount bigint NOT NULL CHECK (amount > 0),
  repeat_period text NOT NULL DEFAULT 'Quarterly'
    CHECK (repeat_period IN ('Unlimited', 'Quarterly', 'Yearly', 'OneTime')),
  quota_cost bigint NOT NULL DEFAULT 1 CHECK (quota_cost > 0),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Retired')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, version),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE app.spark_category_versions
  ADD CONSTRAINT spark_category_versions_no_active_overlap
  EXCLUDE USING gist (
    category_id WITH =,
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (status = 'Active');

CREATE TABLE app.rule_set_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Retired')),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  white_to_yellow_input bigint NOT NULL CHECK (white_to_yellow_input > 0),
  white_to_yellow_output bigint NOT NULL DEFAULT 1 CHECK (white_to_yellow_output > 0),
  white_to_yellow_fee bigint NOT NULL DEFAULT 0 CHECK (white_to_yellow_fee >= 0),
  yellow_to_blue_input bigint NOT NULL CHECK (yellow_to_blue_input > 0),
  yellow_to_blue_output bigint NOT NULL DEFAULT 1 CHECK (yellow_to_blue_output > 0),
  yellow_to_blue_fee bigint NOT NULL DEFAULT 0 CHECK (yellow_to_blue_fee >= 0),
  peer_quarterly_limit bigint NOT NULL CHECK (peer_quarterly_limit > 0),
  yellow_quarterly_limit bigint NOT NULL CHECK (yellow_quarterly_limit > 0),
  coordinator_team_multiplier integer NOT NULL DEFAULT 1 CHECK (coordinator_team_multiplier > 0),
  disenchant_currency char(3) NOT NULL CHECK (disenchant_currency ~ '^[A-Z]{3}$'),
  white_disenchant_rate numeric(18,6) NOT NULL CHECK (white_disenchant_rate > 0),
  yellow_disenchant_rate numeric(18,6) NOT NULL CHECK (yellow_disenchant_rate > 0),
  blue_disenchant_rate numeric(18,6) NOT NULL CHECK (blue_disenchant_rate > 0),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  created_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

ALTER TABLE app.rule_set_versions
  ADD CONSTRAINT rule_set_versions_no_active_overlap
  EXCLUDE USING gist (
    tstzrange(effective_from, COALESCE(effective_to, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (status = 'Active');

CREATE TABLE app.spark_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue', 'Radiant')),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, spark_type)
);

CREATE TABLE app.spark_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL CHECK (operation_type IN (
    'Grant', 'Purchase', 'Conversion', 'Disenchant', 'AdministrativeAdjustment',
    'Reversal', 'Performance', 'PeerRecognition', 'Award', 'InventoryEffect'
  )),
  status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Committed', 'Reversed', 'Failed')),
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  subject_employee_id uuid REFERENCES app.employees(id) ON DELETE RESTRICT,
  rule_set_version_id uuid REFERENCES app.rule_set_versions(id) ON DELETE RESTRICT,
  reversal_of_operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  source_type text,
  source_id uuid,
  request_id text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  CHECK (reversal_of_operation_id IS NULL OR reversal_of_operation_id <> id),
  CHECK ((status = 'Committed' AND committed_at IS NOT NULL) OR status <> 'Committed')
);

CREATE TABLE app.spark_ledger_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES app.spark_accounts(id) ON DELETE RESTRICT,
  entry_kind text NOT NULL CHECK (entry_kind IN (
    'Credit', 'Debit', 'Fee', 'Reversal', 'Reservation', 'ReservationRelease'
  )),
  amount bigint NOT NULL CHECK (amount <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  category_version_id uuid REFERENCES app.spark_category_versions(id) ON DELETE RESTRICT,
  related_entry_id bigint REFERENCES app.spark_ledger_entries(id) ON DELETE RESTRICT,
  source_type text,
  source_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entry_kind IN ('Credit', 'ReservationRelease') AND amount > 0)
    OR (entry_kind IN ('Debit', 'Fee', 'Reservation') AND amount < 0)
    OR entry_kind = 'Reversal'
  ),
  CHECK (entry_kind <> 'Reversal' OR related_entry_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION app.apply_spark_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_balance bigint;
  account_type text;
  next_balance bigint;
  operation_status text;
  related_account_id uuid;
  related_amount bigint;
BEGIN
  SELECT status INTO operation_status
    FROM app.spark_operations
   WHERE id = NEW.operation_id
   FOR SHARE;

  IF operation_status IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'Ledger entries can only be appended to Pending operations'
      USING ERRCODE = '23514';
  END IF;

  SELECT balance, spark_type
    INTO current_balance, account_type
    FROM app.spark_accounts
   WHERE id = NEW.account_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spark account % does not exist', NEW.account_id USING ERRCODE = '23503';
  END IF;

  IF account_type = 'Radiant' AND NEW.amount < 0 AND NEW.entry_kind <> 'Reversal' THEN
    RAISE EXCEPTION 'Radiant Sparks cannot be spent, converted, or disenchanted'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.entry_kind = 'Reversal' THEN
    SELECT account_id, amount INTO related_account_id, related_amount
      FROM app.spark_ledger_entries
     WHERE id = NEW.related_entry_id;
    IF NOT FOUND OR related_account_id <> NEW.account_id OR NEW.amount <> -related_amount THEN
      RAISE EXCEPTION 'A reversal must exactly negate its related entry on the same account'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  next_balance := current_balance + NEW.amount;
  IF next_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient Spark balance for account %', NEW.account_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE app.spark_accounts
     SET balance = next_balance,
         version = version + 1,
         updated_at = clock_timestamp()
   WHERE id = NEW.account_id;

  NEW.balance_after := next_balance;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.prevent_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; write a reversing record instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION app.prevent_employee_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Employees cannot be deleted; deactivate the employee instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_spark_account_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance <> 0 OR NEW.version <> 0 THEN
      RAISE EXCEPTION 'New Spark accounts must start with a zero projection'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.balance, NEW.version) IS DISTINCT FROM (OLD.balance, OLD.version)
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Spark account balances can only be changed by ledger entries'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_published_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'Draft' THEN
      RAISE EXCEPTION 'Published version rows cannot be deleted; create a new version'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;
  -- Closing an effective interval is the only permitted mutation of a
  -- published version. All business fields remain immutable and the new
  -- version is inserted as a separate row.
  IF TG_TABLE_NAME = 'product_versions' THEN
    IF OLD.status = 'Active'
       AND NEW.status = 'Retired'
       AND NEW.available_to IS NOT NULL
       AND (to_jsonb(NEW) - 'status' - 'available_to') = (to_jsonb(OLD) - 'status' - 'available_to') THEN
      RETURN NEW;
    END IF;
  ELSE
    IF OLD.status = 'Active'
       AND NEW.status = 'Retired'
       AND NEW.effective_to IS NOT NULL
       AND OLD.effective_to IS NULL
       AND (to_jsonb(NEW) - 'status' - 'effective_to') = (to_jsonb(OLD) - 'status' - 'effective_to') THEN
      RETURN NEW;
    END IF;
  END IF;
  IF OLD.status <> 'Draft' THEN
    RAISE EXCEPTION 'Published version rows cannot be edited; create a new version'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_spark_operation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'Pending'
     AND NEW.status = 'Committed'
     AND NEW.committed_at IS NOT NULL
     AND (to_jsonb(NEW) - 'status' - 'committed_at') = (to_jsonb(OLD) - 'status' - 'committed_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Committed Spark operations are immutable; create a reversal operation instead'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER spark_ledger_apply_before_insert
  BEFORE INSERT ON app.spark_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.apply_spark_ledger_entry();
CREATE TRIGGER spark_ledger_immutable
  BEFORE UPDATE OR DELETE ON app.spark_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
CREATE TRIGGER spark_operations_immutable
  BEFORE UPDATE OR DELETE ON app.spark_operations
  FOR EACH ROW EXECUTE FUNCTION app.protect_spark_operation();
CREATE TRIGGER spark_accounts_zero_on_insert
  BEFORE INSERT ON app.spark_accounts
  FOR EACH ROW EXECUTE FUNCTION app.protect_spark_account_projection();
CREATE TRIGGER spark_accounts_projection_only
  BEFORE UPDATE OF balance, version ON app.spark_accounts
  FOR EACH ROW EXECUTE FUNCTION app.protect_spark_account_projection();
CREATE TRIGGER spark_category_versions_published_immutable
  BEFORE UPDATE OR DELETE ON app.spark_category_versions
  FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();
CREATE TRIGGER rule_set_versions_published_immutable
  BEFORE UPDATE OR DELETE ON app.rule_set_versions
  FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();
CREATE TRIGGER employees_no_hard_delete
  BEFORE DELETE ON app.employees
  FOR EACH ROW EXECUTE FUNCTION app.prevent_employee_delete();
CREATE TRIGGER login_events_immutable
  BEFORE UPDATE OR DELETE ON app.login_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();

CREATE INDEX spark_category_versions_effective_idx
  ON app.spark_category_versions(category_id, status, effective_from DESC);
CREATE INDEX rule_set_versions_effective_idx
  ON app.rule_set_versions(status, effective_from DESC);
CREATE INDEX spark_accounts_employee_idx ON app.spark_accounts(employee_id);
CREATE INDEX spark_operations_subject_time_idx
  ON app.spark_operations(subject_employee_id, created_at DESC);
CREATE INDEX spark_operations_source_idx
  ON app.spark_operations(source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX spark_ledger_account_time_idx
  ON app.spark_ledger_entries(account_id, occurred_at DESC, id DESC);
CREATE INDEX spark_ledger_operation_idx ON app.spark_ledger_entries(operation_id);
CREATE INDEX spark_ledger_category_idx
  ON app.spark_ledger_entries(category_version_id) WHERE category_version_id IS NOT NULL;

CREATE TRIGGER spark_categories_set_updated_at BEFORE UPDATE ON app.spark_categories
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
