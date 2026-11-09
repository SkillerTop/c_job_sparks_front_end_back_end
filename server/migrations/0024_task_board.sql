CREATE TABLE app.task_board_approval_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  task_id uuid,
  approval_kind text NOT NULL CHECK (approval_kind IN ('Create', 'RewardChange')),
  task_snapshot jsonb NOT NULL CHECK (jsonb_typeof(task_snapshot) = 'object'),
  reward_amount integer NOT NULL CHECK (reward_amount > 0 AND reward_amount <= 1000000),
  first_confirmed_at timestamptz,
  second_confirmed_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT (clock_timestamp() + interval '30 minutes'),
  CHECK (expires_at > created_at),
  CHECK (second_confirmed_at IS NULL OR first_confirmed_at IS NOT NULL),
  CHECK (consumed_at IS NULL OR second_confirmed_at IS NOT NULL)
);

CREATE TABLE app.task_board_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
  reward_spark_type text NOT NULL DEFAULT 'White' CHECK (reward_spark_type = 'White'),
  reward_amount integer NOT NULL CHECK (reward_amount > 0 AND reward_amount <= 1000000),
  author_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  author_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  author_department_id uuid REFERENCES app.departments(id) ON DELETE SET NULL,
  author_department_name text NOT NULL CHECK (length(btrim(author_department_name)) BETWEEN 1 AND 200),
  approval_session_id uuid NOT NULL REFERENCES app.task_board_approval_sessions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Booked', 'Completed', 'Cancelled')),
  assignee_user_id uuid REFERENCES app.users(id) ON DELETE RESTRICT,
  assignee_employee_id uuid REFERENCES app.employees(id) ON DELETE RESTRICT,
  booked_at timestamptz,
  due_date date,
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  reward_operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  deleted_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version > 0),
  CHECK ((assignee_user_id IS NULL) = (assignee_employee_id IS NULL)),
  CHECK ((deleted_at IS NULL) = (deleted_by_user_id IS NULL)),
  CHECK (
    (status = 'Active' AND assignee_employee_id IS NULL AND booked_at IS NULL
      AND completed_at IS NULL AND reward_operation_id IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'Booked' AND assignee_employee_id IS NOT NULL AND booked_at IS NOT NULL
      AND completed_at IS NULL AND reward_operation_id IS NULL AND cancelled_at IS NULL)
    OR
    (status = 'Completed' AND assignee_employee_id IS NOT NULL AND booked_at IS NOT NULL
      AND completed_at IS NOT NULL AND reward_operation_id IS NOT NULL AND cancelled_at IS NULL)
    OR
    (status = 'Cancelled' AND assignee_employee_id IS NULL AND booked_at IS NULL
      AND completed_at IS NULL AND reward_operation_id IS NULL AND cancelled_at IS NOT NULL)
  )
);

ALTER TABLE app.task_board_approval_sessions
  ADD CONSTRAINT task_board_approval_sessions_task_fk
  FOREIGN KEY (task_id) REFERENCES app.task_board_tasks(id) ON DELETE RESTRICT;

CREATE TABLE app.task_board_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES app.task_board_tasks(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'Created', 'ApprovalFirstConfirmed', 'ApprovalSecondConfirmed', 'Updated',
    'Booked', 'AssigneeDetached', 'Completed', 'RewardCredited', 'Cancelled', 'Deleted'
  )),
  before_state jsonb CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  after_state jsonb CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX task_board_tasks_board_idx
  ON app.task_board_tasks(status, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX task_board_tasks_author_idx
  ON app.task_board_tasks(author_employee_id, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX task_board_tasks_assignee_idx
  ON app.task_board_tasks(assignee_employee_id, created_at DESC)
  WHERE deleted_at IS NULL AND assignee_employee_id IS NOT NULL;
CREATE INDEX task_board_approval_sessions_expiry_idx
  ON app.task_board_approval_sessions(expires_at)
  WHERE consumed_at IS NULL;
CREATE INDEX task_board_events_task_time_idx
  ON app.task_board_events(task_id, occurred_at DESC, id DESC);

CREATE TRIGGER task_board_events_immutable
  BEFORE UPDATE OR DELETE ON app.task_board_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();

ALTER TABLE app.notifications
  DROP CONSTRAINT notifications_notification_type_check;

ALTER TABLE app.notifications
  ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'ApprovalRequested', 'AwardApproved', 'AwardRejected', 'SparksCredited',
    'PurchaseCompleted', 'InventoryActivated', 'InventoryExpiring',
    'DisenchantStatusChanged', 'TaskBooked', 'TaskUnassigned', 'TaskCompleted',
    'TaskRewardFailed', 'System'
  ));
