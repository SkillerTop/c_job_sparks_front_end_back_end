ALTER TABLE app.product_versions
  ADD COLUMN available_locations text[] NOT NULL
  DEFAULT ARRAY['Ukraine', 'Poland', 'Bulgaria']::text[];

ALTER TABLE app.product_versions
  ADD CONSTRAINT product_versions_available_locations_valid CHECK (
    cardinality(available_locations) BETWEEN 1 AND 3
    AND available_locations <@ ARRAY['Ukraine', 'Poland', 'Bulgaria']::text[]
  );

CREATE INDEX product_versions_available_locations_idx
  ON app.product_versions USING gin (available_locations);
