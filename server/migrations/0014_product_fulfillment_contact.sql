ALTER TABLE app.product_versions
  ADD COLUMN fulfillment_contact_id uuid
    REFERENCES app.reward_fulfillment_contacts(id) ON DELETE RESTRICT;

UPDATE app.product_versions
   SET fulfillment_contact_id = 'd1000000-0000-4000-8000-000000000003'
 WHERE fulfillment_kind <> 'Virtual'
   AND fulfillment_contact_id IS NULL;

ALTER TABLE app.product_versions
  ADD CONSTRAINT product_versions_fulfillment_contact_check CHECK (
    (fulfillment_kind = 'Virtual' AND fulfillment_contact_id IS NULL)
    OR
    (fulfillment_kind <> 'Virtual' AND fulfillment_contact_id IS NOT NULL)
  );

CREATE INDEX product_versions_fulfillment_contact_idx
  ON app.product_versions(fulfillment_contact_id)
  WHERE fulfillment_contact_id IS NOT NULL;
