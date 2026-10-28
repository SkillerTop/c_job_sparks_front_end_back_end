CREATE TABLE app.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN (
    'ApprovalRequested', 'AwardApproved', 'AwardRejected', 'SparksCredited',
    'PurchaseCompleted', 'InventoryActivated', 'InventoryExpiring',
    'DisenchantStatusChanged', 'System'
  )),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 250),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  object_type text,
  object_id uuid,
  link_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK ((object_type IS NULL) = (object_id IS NULL))
);

CREATE TABLE app.audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(btrim(action)) > 0),
  entity_type text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  before_state jsonb CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  after_state jsonb CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'),
  reason text,
  request_id text,
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (length(btrim(scope)) BETWEEN 1 AND 100),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 255),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'Processing' CHECK (status IN ('Processing', 'Completed', 'Failed')),
  response_status integer CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  locked_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, scope, idempotency_key),
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'Processing' AND completed_at IS NULL)
    OR (status <> 'Processing' AND completed_at IS NOT NULL AND response_status IS NOT NULL)
  )
);

CREATE TABLE app.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL CHECK (length(btrim(aggregate_type)) > 0),
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL CHECK (length(btrim(event_type)) > 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  CHECK ((locked_at IS NULL AND locked_by IS NULL) OR (locked_at IS NOT NULL AND locked_by IS NOT NULL))
);

CREATE INDEX notifications_recipient_unread_idx
  ON app.notifications(recipient_user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_recipient_time_idx
  ON app.notifications(recipient_user_id, created_at DESC);
CREATE INDEX audit_events_entity_time_idx
  ON app.audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_events_actor_time_idx
  ON app.audit_events(actor_user_id, occurred_at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_events_request_idx ON app.audit_events(request_id) WHERE request_id IS NOT NULL;
CREATE INDEX idempotency_keys_expiry_idx ON app.idempotency_keys(expires_at);
CREATE INDEX idempotency_keys_processing_idx
  ON app.idempotency_keys(locked_at) WHERE status = 'Processing';
CREATE INDEX outbox_events_pending_idx
  ON app.outbox_events(available_at, occurred_at) WHERE published_at IS NULL;
CREATE INDEX outbox_events_aggregate_idx
  ON app.outbox_events(aggregate_type, aggregate_id, occurred_at);

CREATE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON app.audit_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
