ALTER TABLE app.product_versions
  ADD COLUMN fulfillment_kind text NOT NULL DEFAULT 'Virtual'
    CHECK (fulfillment_kind IN ('Virtual', 'Physical', 'Certificate', 'ITEquipment'));

CREATE TABLE app.reward_fulfillment_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 200),
  email citext NOT NULL UNIQUE,
  contact_role text NOT NULL CHECK (contact_role IN ('Director', 'OfficeManager', 'DepartmentHead')),
  office_name text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.reward_fulfillment_contacts
  (id, display_name, email, contact_role, office_name, sort_order)
VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Andrey Zherebetsky', 'a.zherebetsky@c-job.com.ua', 'Director', NULL, 10),
  ('d1000000-0000-4000-8000-000000000002', 'Olga Kalnauz', 'o.kalnauz@c-job.com.ua', 'Director', NULL, 20),
  ('d1000000-0000-4000-8000-000000000003', 'Marharyta Nazarenko', 'm.nazarenko@c-job.com.ua', 'OfficeManager', 'Main office', 30),
  ('d1000000-0000-4000-8000-000000000004', 'Miglena Keranova', 'm.keranova@c-job.com.ua', 'OfficeManager', 'Varna office', 40),
  ('d1000000-0000-4000-8000-000000000005', 'Mariya Petrenko', 'm.petrenko@c-job.com.ua', 'OfficeManager', 'Gdansk office', 50),
  ('d1000000-0000-4000-8000-000000000006', 'Mykhailo Balanovskyi', 'm.balanovskiy@c-job.com.ua', 'DepartmentHead', 'Pipes & Systems Department', 60),
  ('d1000000-0000-4000-8000-000000000007', 'Ivan Tatko', 'i.tatko@c-job.com.ua', 'DepartmentHead', 'Hull & Basic Design Department', 70),
  ('d1000000-0000-4000-8000-000000000008', 'Mariia Klimova', 'm.klimova@c-job.com.ua', 'DepartmentHead', 'Hull Outfitting & Equipment Department', 80),
  ('d1000000-0000-4000-8000-000000000009', 'Dmytro Volik', 'd.volik@c-job.com.ua', 'DepartmentHead', 'Structural Analysis and R&D', 90);

CREATE TABLE app.reward_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('RadiantAward', 'ShopPurchase')),
  award_request_id uuid UNIQUE REFERENCES app.award_requests(id) ON DELETE RESTRICT,
  purchase_id uuid UNIQUE REFERENCES app.purchases(id) ON DELETE RESTRICT,
  recipient_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE RESTRICT,
  assigned_contact_id uuid NOT NULL REFERENCES app.reward_fulfillment_contacts(id) ON DELETE RESTRICT,
  reward_kind text NOT NULL CHECK (reward_kind IN (
    'RadiantAcrylic', 'RadiantVesselModel', 'ShopPhysical', 'ShopCertificate', 'ShopEquipment'
  )),
  delivery_method text NOT NULL CHECK (delivery_method IN (
    'OfficePickup', 'EmployeePaidDelivery', 'WorkEmail', 'InternalCoordination'
  )),
  office_name text,
  valuable_prize_description text,
  status text NOT NULL DEFAULT 'Requested'
    CHECK (status IN ('Requested', 'InProgress', 'Ordered', 'Ready', 'Delivered', 'Cancelled')),
  requested_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES app.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  notes text,
  CHECK (
    (source_type = 'RadiantAward' AND award_request_id IS NOT NULL AND purchase_id IS NULL)
    OR (source_type = 'ShopPurchase' AND purchase_id IS NOT NULL AND award_request_id IS NULL)
  ),
  CHECK (delivery_method <> 'OfficePickup' OR office_name IS NOT NULL),
  CHECK (status <> 'Delivered' OR completed_at IS NOT NULL)
);

CREATE INDEX reward_fulfillments_status_idx
  ON app.reward_fulfillments(status, requested_at DESC);
CREATE INDEX reward_fulfillments_recipient_idx
  ON app.reward_fulfillments(recipient_employee_id, requested_at DESC);

CREATE TABLE app.disenchant_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  report_month date NOT NULL CHECK (report_month = date_trunc('month', report_month)::date),
  range_started_at timestamptz,
  range_ended_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'Created' CHECK (status IN ('Created', 'Submitted', 'Paid')),
  created_by_user_id uuid NOT NULL REFERENCES app.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  paid_at timestamptz,
  UNIQUE (department_id, report_month),
  CHECK (range_started_at IS NULL OR range_ended_at >= range_started_at),
  CHECK (status = 'Created' OR submitted_at IS NOT NULL),
  CHECK (status <> 'Paid' OR paid_at IS NOT NULL)
);

CREATE TABLE app.disenchant_report_items (
  report_id uuid NOT NULL REFERENCES app.disenchant_reports(id) ON DELETE RESTRICT,
  disenchant_request_id uuid NOT NULL UNIQUE REFERENCES app.disenchant_requests(id) ON DELETE RESTRICT,
  employee_name_snapshot text NOT NULL,
  spark_type text NOT NULL CHECK (spark_type IN ('White', 'Yellow', 'Blue')),
  spark_amount bigint NOT NULL CHECK (spark_amount > 0),
  money_amount numeric(18,2) NOT NULL CHECK (money_amount > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, disenchant_request_id)
);

CREATE INDEX disenchant_reports_department_time_idx
  ON app.disenchant_reports(department_id, report_month DESC);

