ALTER TABLE app.products
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL;

ALTER TABLE app.products
  ADD CONSTRAINT products_deleted_actor_check CHECK (
    deleted_at IS NOT NULL OR deleted_by_user_id IS NULL
  );

CREATE INDEX products_catalog_visible_idx
  ON app.products(is_active, updated_at DESC)
  WHERE deleted_at IS NULL;

