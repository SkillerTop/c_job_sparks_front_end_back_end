-- Employee deletion is now an explicit administrator action. The API performs
-- reference checks first and refuses deletion when immutable business history
-- exists, so the original blanket no-delete trigger is no longer required.
DROP TRIGGER IF EXISTS employees_no_hard_delete ON app.employees;
