CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE app.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text,
  parent_department_id uuid REFERENCES app.departments(id) ON DELETE RESTRICT,
  head_employee_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_department_id IS NULL OR parent_department_id <> id)
);

CREATE TABLE app.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text,
  auth_provider text NOT NULL DEFAULT 'local' CHECK (auth_provider IN ('local', 'entra')),
  provider_subject text,
  account_status text NOT NULL DEFAULT 'Pending'
    CHECK (account_status IN ('Pending', 'Approved', 'Rejected', 'Disabled')),
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  password_changed_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  disabled_at timestamptz,
  disabled_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (
    (auth_provider = 'local' AND password_hash IS NOT NULL AND provider_subject IS NULL)
    OR (auth_provider = 'entra' AND password_hash IS NULL AND provider_subject IS NOT NULL)
  ),
  UNIQUE (auth_provider, provider_subject)
);

CREATE TABLE app.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES app.users(id) ON DELETE SET NULL,
  employee_number text NOT NULL UNIQUE CHECK (length(btrim(employee_number)) BETWEEN 1 AND 64),
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 100),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  contact_email citext,
  department_id uuid REFERENCES app.departments(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES app.positions(id) ON DELETE RESTRICT,
  manager_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE,
  hire_date date,
  termination_date date,
  worked_hours numeric(12,2) NOT NULL DEFAULT 0 CHECK (worked_hours >= 0),
  provisioned_role_code text NOT NULL DEFAULT 'Employee'
    CHECK (provisioned_role_code IN ('Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Administrator')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK (manager_employee_id IS NULL OR manager_employee_id <> id),
  CHECK (termination_date IS NULL OR hire_date IS NULL OR termination_date >= hire_date)
);

ALTER TABLE app.departments
  ADD CONSTRAINT departments_head_employee_fk
  FOREIGN KEY (head_employee_id) REFERENCES app.employees(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE;

CREATE TABLE app.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  description text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  is_system boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (code IN ('Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Administrator'))
);

CREATE TABLE app.role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES app.roles(id) ON DELETE RESTRICT,
  scope_type text NOT NULL DEFAULT 'global'
    CHECK (scope_type IN ('global', 'department', 'project', 'team')),
  scope_id uuid,
  assigned_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope_type = 'global' AND scope_id IS NULL) OR (scope_type <> 'global' AND scope_id IS NOT NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE UNIQUE INDEX role_assignments_global_unique
  ON app.role_assignments(user_id, role_id)
  WHERE scope_type = 'global' AND ends_at IS NULL;
CREATE UNIQUE INDEX role_assignments_scoped_unique
  ON app.role_assignments(user_id, role_id, scope_type, scope_id)
  WHERE scope_type <> 'global' AND ends_at IS NULL;

CREATE TABLE app.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description text,
  department_id uuid REFERENCES app.departments(id) ON DELETE RESTRICT,
  manager_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Planned', 'Active', 'Completed', 'Archived')),
  starts_on date,
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE app.project_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  coordinator_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
  gpm_employee_id uuid REFERENCES app.employees(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE app.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES app.projects(id) ON DELETE CASCADE,
  team_id uuid REFERENCES app.project_teams(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  member_role text,
  worked_hours numeric(12,2) NOT NULL DEFAULT 0 CHECK (worked_hours >= 0),
  joined_on date NOT NULL DEFAULT CURRENT_DATE,
  left_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (left_on IS NULL OR left_on >= joined_on)
);

CREATE UNIQUE INDEX project_members_active_unique
  ON app.project_members(project_id, employee_id)
  WHERE is_active;

CREATE TABLE app.access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  employee_number text,
  requested_department_id uuid REFERENCES app.departments(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Expired')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  rejection_reason text,
  resulting_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  request_ip inet,
  request_user_agent text,
  CHECK ((status <> 'Rejected') OR (rejection_reason IS NOT NULL AND length(btrim(rejection_reason)) > 0)),
  CHECK ((status = 'Pending' AND reviewed_at IS NULL) OR (status <> 'Pending' AND reviewed_at IS NOT NULL))
);

CREATE UNIQUE INDEX access_requests_pending_email_unique
  ON app.access_requests(email)
  WHERE status = 'Pending';

CREATE TABLE app.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  ip_address inet,
  user_agent text,
  device_name text,
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE app.user_preferences (
  user_id uuid PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone text NOT NULL DEFAULT 'UTC',
  notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(notification_settings) = 'object'),
  accessibility_settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(accessibility_settings) = 'object'),
  avatar_media_asset_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'change_email')),
  pending_email citext,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose = 'change_email' AND pending_email IS NOT NULL) OR purpose = 'verify_email'),
  CHECK (expires_at > created_at)
);

CREATE TABLE app.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_ip inet,
  CHECK (expires_at > created_at)
);

CREATE TABLE app.login_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  email citext NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('Succeeded', 'Failed', 'Blocked', 'LoggedOut', 'SessionRevoked')),
  reason text,
  ip_address inet,
  user_agent text,
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX departments_active_idx ON app.departments(is_active, name);
CREATE INDEX employees_department_active_idx ON app.employees(department_id, is_active);
CREATE INDEX employees_manager_idx ON app.employees(manager_employee_id) WHERE manager_employee_id IS NOT NULL;
CREATE INDEX role_assignments_user_active_idx ON app.role_assignments(user_id, starts_at, ends_at);
CREATE INDEX projects_department_active_idx ON app.projects(department_id, is_active);
CREATE INDEX project_teams_project_active_idx ON app.project_teams(project_id, is_active);
CREATE INDEX project_members_employee_active_idx ON app.project_members(employee_id, is_active);
CREATE INDEX sessions_user_active_idx ON app.sessions(user_id, expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX email_verification_tokens_user_active_idx ON app.email_verification_tokens(user_id, expires_at) WHERE consumed_at IS NULL;
CREATE INDEX password_reset_tokens_user_active_idx ON app.password_reset_tokens(user_id, expires_at) WHERE consumed_at IS NULL;
CREATE INDEX login_events_user_time_idx ON app.login_events(user_id, occurred_at DESC);
CREATE INDEX login_events_email_time_idx ON app.login_events(email, occurred_at DESC);

CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON app.departments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER positions_set_updated_at BEFORE UPDATE ON app.positions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON app.users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON app.employees
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER roles_set_updated_at BEFORE UPDATE ON app.roles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON app.projects
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER project_teams_set_updated_at BEFORE UPDATE ON app.project_teams
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER project_members_set_updated_at BEFORE UPDATE ON app.project_members
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER user_preferences_set_updated_at BEFORE UPDATE ON app.user_preferences
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
