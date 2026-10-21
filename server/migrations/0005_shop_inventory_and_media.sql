CREATE TABLE app.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_provider text NOT NULL CHECK (storage_provider IN ('local', 's3', 'azure_blob')),
  storage_key text NOT NULL,
  original_file_name text NOT NULL,
  content_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  status text NOT NULL DEFAULT 'Ready' CHECK (status IN ('Pending', 'Ready', 'Quarantined', 'Deleted')),
  uploaded_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (storage_provider, storage_key)
);

ALTER TABLE app.user_preferences
  ADD CONSTRAINT user_preferences_avatar_media_asset_fk
  FOREIGN KEY (avatar_media_asset_id) REFERENCES app.media_assets(id) ON DELETE SET NULL;

CREATE TABLE app.shop_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),
  category_id uuid NOT NULL REFERENCES app.shop_categories(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  short_description text,
  description text,
  rarity text NOT NULL CHECK (rarity IN ('Common', 'Uncommon', 'Rare', 'Epic', 'Legendary')),
  price_spark_type text NOT NULL CHECK (price_spark_type IN ('White', 'Yellow', 'Blue')),
  price_amount bigint NOT NULL CHECK (price_amount > 0),
  effect_code text NOT NULL CHECK (effect_code IN (
    'theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode',
    'double_white', 'streak_shield', 'mission_reroll', 'mystery_pack'
  )),
  effect_configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(effect_configuration) = 'object'),
  status text NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Active', 'Retired')),
  is_purchasable boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_limited boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  available_from timestamptz NOT NULL,
  available_to timestamptz,
  inventory_ttl_seconds bigint CHECK (inventory_ttl_seconds IS NULL OR inventory_ttl_seconds > 0),
  created_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version),
  CHECK (available_to IS NULL OR available_to > available_from),
  CHECK (
    is_purchasable = false
    OR effect_code IN ('theme_unlock', 'profile_frame', 'badge_unlock', 'focus_mode')
  )
);

ALTER TABLE app.product_versions
  ADD CONSTRAINT product_versions_no_active_overlap
  EXCLUDE USING gist (
    product_id WITH =,
    tstzrange(available_from, COALESCE(available_to, 'infinity'::timestamptz), '[)') WITH &&
  ) WHERE (status = 'Active');

CREATE TABLE app.product_media (
  product_version_id uuid NOT NULL REFERENCES app.product_versions(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES app.media_assets(id) ON DELETE RESTRICT,
  purpose text NOT NULL DEFAULT 'Gallery' CHECK (purpose IN ('Thumbnail', 'Gallery')),
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_version_id, media_asset_id)
);

CREATE TABLE app.product_stock (
  product_id uuid PRIMARY KEY REFERENCES app.products(id) ON DELETE RESTRICT,
  available_quantity bigint NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  product_version_id uuid REFERENCES app.product_versions(id) ON DELETE RESTRICT,
  quantity_delta bigint NOT NULL CHECK (quantity_delta <> 0),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (reason IN ('InitialStock', 'Restock', 'Purchase', 'Correction', 'Reversal')),
  source_type text,
  source_id uuid,
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.apply_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  current_quantity bigint;
  next_quantity bigint;
BEGIN
  SELECT available_quantity INTO current_quantity
    FROM app.product_stock
   WHERE product_id = NEW.product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock projection for product % does not exist', NEW.product_id
      USING ERRCODE = '23503';
  END IF;

  next_quantity := current_quantity + NEW.quantity_delta;
  IF next_quantity < 0 THEN
    RAISE EXCEPTION 'Insufficient stock for product %', NEW.product_id
      USING ERRCODE = '23514';
  END IF;

  UPDATE app.product_stock
     SET available_quantity = next_quantity,
         version = version + 1,
         updated_at = clock_timestamp()
   WHERE product_id = NEW.product_id;

  NEW.balance_after := next_quantity;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.protect_stock_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.available_quantity <> 0 OR NEW.version <> 0 THEN
      RAISE EXCEPTION 'New stock projections must start at zero'
        USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.available_quantity, NEW.version) IS DISTINCT FROM (OLD.available_quantity, OLD.version)
     AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'Product stock can only be changed by stock movements'
      USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TABLE app.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  spark_operation_id uuid NOT NULL UNIQUE REFERENCES app.spark_operations(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Completed' CHECK (status IN ('Completed', 'Cancelled')),
  total_price_spark_type text NOT NULL CHECK (total_price_spark_type IN ('White', 'Yellow', 'Blue')),
  total_price_amount bigint NOT NULL CHECK (total_price_amount > 0),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CHECK (
    (status = 'Cancelled' AND cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
    OR status = 'Completed'
  )
);

CREATE TABLE app.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES app.purchases(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES app.product_versions(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  effect_code_snapshot text NOT NULL,
  effect_configuration_snapshot jsonb NOT NULL CHECK (jsonb_typeof(effect_configuration_snapshot) = 'object'),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_spark_type text NOT NULL CHECK (unit_price_spark_type IN ('White', 'Yellow', 'Blue')),
  unit_price_amount bigint NOT NULL CHECK (unit_price_amount > 0),
  line_total_amount bigint GENERATED ALWAYS AS (quantity::bigint * unit_price_amount) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  purchase_item_id uuid NOT NULL REFERENCES app.purchase_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES app.products(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL REFERENCES app.product_versions(id) ON DELETE RESTRICT,
  effect_code text NOT NULL,
  effect_configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(effect_configuration) = 'object'),
  status text NOT NULL DEFAULT 'Available'
    CHECK (status IN ('Available', 'Active', 'Used', 'Expired', 'Revoked')),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at > acquired_at)
);

CREATE TABLE app.inventory_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  inventory_item_id uuid NOT NULL REFERENCES app.inventory_items(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('Created', 'Activated', 'Used', 'Expired', 'Revoked')),
  actor_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.effect_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL UNIQUE REFERENCES app.inventory_items(id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  effect_code text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK (revoked_at IS NULL OR revoked_at >= starts_at)
);

CREATE TRIGGER stock_movement_apply_before_insert
  BEFORE INSERT ON app.stock_movements
  FOR EACH ROW EXECUTE FUNCTION app.apply_stock_movement();
CREATE TRIGGER stock_movements_immutable
  BEFORE UPDATE OR DELETE ON app.stock_movements
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
CREATE TRIGGER product_stock_zero_on_insert
  BEFORE INSERT ON app.product_stock
  FOR EACH ROW EXECUTE FUNCTION app.protect_stock_projection();
CREATE TRIGGER product_stock_projection_only
  BEFORE UPDATE OF available_quantity, version ON app.product_stock
  FOR EACH ROW EXECUTE FUNCTION app.protect_stock_projection();
CREATE TRIGGER inventory_events_immutable
  BEFORE UPDATE OR DELETE ON app.inventory_events
  FOR EACH ROW EXECUTE FUNCTION app.prevent_immutable_change();
CREATE TRIGGER product_versions_published_immutable
  BEFORE UPDATE OR DELETE ON app.product_versions
  FOR EACH ROW EXECUTE FUNCTION app.protect_published_version();

CREATE INDEX media_assets_sha256_idx ON app.media_assets(sha256);
CREATE INDEX products_catalog_idx ON app.products(category_id, is_active, created_at DESC);
CREATE INDEX product_versions_catalog_idx
  ON app.product_versions(status, is_purchasable, available_from, available_to);
CREATE INDEX product_media_order_idx ON app.product_media(product_version_id, purpose, sort_order);
CREATE INDEX stock_movements_product_time_idx
  ON app.stock_movements(product_id, occurred_at DESC, id DESC);
CREATE INDEX purchases_employee_time_idx ON app.purchases(employee_id, purchased_at DESC);
CREATE INDEX purchase_items_purchase_idx ON app.purchase_items(purchase_id);
CREATE INDEX inventory_items_owner_status_idx
  ON app.inventory_items(owner_employee_id, status, acquired_at DESC);
CREATE INDEX inventory_items_expiry_idx
  ON app.inventory_items(expires_at) WHERE status IN ('Available', 'Active') AND expires_at IS NOT NULL;
CREATE INDEX inventory_events_item_time_idx
  ON app.inventory_events(inventory_item_id, occurred_at DESC);
CREATE INDEX effect_grants_employee_active_idx
  ON app.effect_grants(employee_id, effect_code, expires_at) WHERE revoked_at IS NULL;

CREATE TRIGGER shop_categories_set_updated_at BEFORE UPDATE ON app.shop_categories
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON app.products
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
