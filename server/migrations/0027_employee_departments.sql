CREATE TABLE app.employee_departments (
  employee_id uuid NOT NULL REFERENCES app.employees(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES app.departments(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (employee_id, department_id)
);

CREATE UNIQUE INDEX employee_departments_one_primary_idx
  ON app.employee_departments(employee_id) WHERE is_primary;
CREATE INDEX employee_departments_department_idx
  ON app.employee_departments(department_id, employee_id);

INSERT INTO app.employee_departments (employee_id, department_id, is_primary)
SELECT id, department_id, true
  FROM app.employees
 WHERE department_id IS NOT NULL
ON CONFLICT (employee_id, department_id) DO UPDATE SET is_primary=true;

-- A Head may lead more than one department. Make every headed department an
-- explicit membership without changing the Head's existing primary department.
INSERT INTO app.employee_departments (employee_id, department_id, is_primary)
SELECT head_employee_id, id, false
  FROM app.departments
 WHERE head_employee_id IS NOT NULL
ON CONFLICT (employee_id, department_id) DO NOTHING;
