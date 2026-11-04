-- Physical and service rewards do not grant a digital inventory effect.
ALTER TABLE app.product_versions ALTER COLUMN effect_code DROP NOT NULL;
ALTER TABLE app.purchase_items ALTER COLUMN effect_code_snapshot DROP NOT NULL;
ALTER TABLE app.inventory_items ALTER COLUMN effect_code DROP NOT NULL;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'app.product_versions'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%is_purchasable%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.product_versions DROP CONSTRAINT %I', constraint_name);
  END IF;
END;
$$;

ALTER TABLE app.product_versions
  ADD CONSTRAINT product_versions_purchasable_effect_check
  CHECK (
    is_purchasable = false
    OR fulfillment_kind <> 'Virtual'
    OR effect_code IN ('theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode')
  );

ALTER TABLE app.purchases
  ADD COLUMN cancellation_operation_id uuid UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT;

ALTER TABLE app.reward_fulfillments
  ADD COLUMN cancelled_at timestamptz;

ALTER TABLE app.reward_fulfillments
  ADD CONSTRAINT reward_fulfillments_cancelled_check
  CHECK (status <> 'Cancelled' OR cancelled_at IS NOT NULL);

-- Old idempotency responses must not become an indefinite secondary data store.
UPDATE app.idempotency_keys
   SET expires_at = LEAST(expires_at, clock_timestamp() + interval '72 hours');

CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx
  ON app.idempotency_keys(expires_at);
