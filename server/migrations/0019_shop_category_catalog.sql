INSERT INTO app.shop_categories (id, code, name, sort_order, is_active)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'merch', 'Merch', 10, true),
  ('c1000000-0000-4000-8000-000000000002', 'subscription', 'Subscription', 20, true),
  ('c1000000-0000-4000-8000-000000000003', 'certificate', 'Certificate', 30, true),
  ('c1000000-0000-4000-8000-000000000004', 'tool', 'Tool', 40, true),
  ('c1000000-0000-4000-8000-000000000005', 'service', 'Service', 50, true),
  ('c1000000-0000-4000-8000-000000000006', 'other', 'Other', 60, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = clock_timestamp();

WITH latest_product_versions AS (
  SELECT DISTINCT ON (version.product_id)
    version.product_id,
    version.fulfillment_kind,
    version.inventory_ttl_seconds,
    version.effect_code
  FROM app.product_versions AS version
  ORDER BY version.product_id, version.version DESC
), product_category_targets AS (
  SELECT
    product_id,
    CASE
      WHEN fulfillment_kind = 'Physical' THEN 'merch'
      WHEN fulfillment_kind = 'Certificate' THEN 'certificate'
      WHEN fulfillment_kind = 'ITEquipment' THEN 'tool'
      WHEN inventory_ttl_seconds IS NOT NULL THEN 'subscription'
      WHEN effect_code IN ('streak_shield', 'mission_reroll') THEN 'tool'
      WHEN effect_code = 'mystery_pack' THEN 'other'
      ELSE 'service'
    END AS category_code
  FROM latest_product_versions
)
UPDATE app.products AS product
SET category_id = category.id,
    updated_at = clock_timestamp()
FROM product_category_targets AS target
JOIN app.shop_categories AS category ON category.code = target.category_code
WHERE product.id = target.product_id
  AND product.category_id IS DISTINCT FROM category.id;

UPDATE app.shop_categories
SET is_active = false,
    updated_at = clock_timestamp()
WHERE code NOT IN ('merch', 'subscription', 'certificate', 'tool', 'service', 'other')
  AND is_active;
