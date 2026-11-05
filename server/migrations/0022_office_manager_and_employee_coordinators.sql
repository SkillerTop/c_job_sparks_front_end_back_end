ALTER TABLE app.employees
  DROP CONSTRAINT IF EXISTS employees_provisioned_role_code_check;

ALTER TABLE app.employees
  ADD CONSTRAINT employees_provisioned_role_code_check
  CHECK (provisioned_role_code IN (
    'Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager', 'Administrator'
  ));

ALTER TABLE app.roles
  DROP CONSTRAINT IF EXISTS roles_code_check;

ALTER TABLE app.roles
  ADD CONSTRAINT roles_code_check
  CHECK (code IN (
    'Employee', 'Coordinator', 'GPM', 'Head', 'Top Management', 'Office Manager', 'Administrator'
  ));

INSERT INTO app.roles (code, name, description, permissions, is_system)
VALUES (
  'Office Manager',
  'Office Manager',
  'Read-only Reward Shop access and operational reward fulfillment management.',
  '{"shopRead": true, "rewardFulfillmentManage": true}'::jsonb,
  true
)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    is_system = EXCLUDED.is_system,
    updated_at = clock_timestamp();

CREATE TABLE app.employee_coordinators (
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  coordinator_employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (employee_id, coordinator_employee_id),
  CHECK (employee_id <> coordinator_employee_id)
);

CREATE INDEX employee_coordinators_coordinator_idx
  ON app.employee_coordinators(coordinator_employee_id, employee_id);

-- Preserve existing directory intent where a Coordinator was previously stored as the sole manager.
INSERT INTO app.employee_coordinators (employee_id, coordinator_employee_id)
SELECT employee.id, employee.manager_employee_id
  FROM app.employees employee
  JOIN app.employees coordinator ON coordinator.id=employee.manager_employee_id
 WHERE employee.manager_employee_id IS NOT NULL
   AND coordinator.is_active
   AND coordinator.provisioned_role_code='Coordinator'
ON CONFLICT DO NOTHING;
