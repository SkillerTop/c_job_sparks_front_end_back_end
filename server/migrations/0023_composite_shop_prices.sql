-- A product can require several spendable Spark types in one atomic purchase.
ALTER TABLE app.product_versions
  ADD COLUMN price_components jsonb;

UPDATE app.product_versions
   SET price_components = jsonb_build_array(jsonb_build_object(
     'sparkType', price_spark_type,
     'amount', price_amount
   ));

ALTER TABLE app.product_versions
  ALTER COLUMN price_components SET NOT NULL,
  ADD CONSTRAINT product_versions_price_components_valid CHECK (
    jsonb_typeof(price_components) = 'array'
    AND jsonb_array_length(price_components) BETWEEN 1 AND 3
  );

ALTER TABLE app.purchases
  ADD COLUMN price_components jsonb;

UPDATE app.purchases
   SET price_components = jsonb_build_array(jsonb_build_object(
     'sparkType', total_price_spark_type,
     'amount', total_price_amount
   ));

ALTER TABLE app.purchases
  ALTER COLUMN price_components SET NOT NULL,
  ADD CONSTRAINT purchases_price_components_valid CHECK (
    jsonb_typeof(price_components) = 'array'
    AND jsonb_array_length(price_components) BETWEEN 1 AND 3
  );

ALTER TABLE app.purchase_items
  ADD COLUMN unit_price_components jsonb;

UPDATE app.purchase_items
   SET unit_price_components = jsonb_build_array(jsonb_build_object(
     'sparkType', unit_price_spark_type,
     'amount', unit_price_amount
   ));

ALTER TABLE app.purchase_items
  ALTER COLUMN unit_price_components SET NOT NULL,
  ADD CONSTRAINT purchase_items_price_components_valid CHECK (
    jsonb_typeof(unit_price_components) = 'array'
    AND jsonb_array_length(unit_price_components) BETWEEN 1 AND 3
  );
