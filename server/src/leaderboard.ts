import type { PoolClient } from 'pg';
import { createLeaderboardResponse, LEADERBOARD_SPARK_WEIGHTS } from '../shared/leaderboard-contract.js';
import type { AuthenticatedPrincipal } from './domain.js';
import { notFound } from './errors.js';
import { maybeOne, rows } from './sql.js';

const leaderboardScoreSql = `achievement.spark_amount * CASE achievement.spark_type
  WHEN 'White' THEN ${LEADERBOARD_SPARK_WEIGHTS.White}
  WHEN 'Yellow' THEN ${LEADERBOARD_SPARK_WEIGHTS.Yellow}
  WHEN 'Blue' THEN ${LEADERBOARD_SPARK_WEIGHTS.Blue}
  ELSE 0 END`;

export const listLeaderboard = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  departmentId?: string,
) => {
  if (departmentId) {
    const department = await maybeOne<{ id: string }>(db,
      `SELECT id FROM app.departments WHERE id=$1 AND is_active`, [departmentId]);
    if (!department) throw notFound('Department');
  }

  const [departments, candidateRows] = await Promise.all([
    rows<{ id: string; name: string }>(db,
      `SELECT id,name FROM app.departments WHERE is_active ORDER BY name,id`),
    rows<{
      employee_id: string;
      name: string;
      title: string;
      department_id: string;
      amount: string | number;
      previous_amount: string | number;
    }>(db, `
      SELECT employee.id AS employee_id,
             employee.display_name AS name,
             COALESCE(position.title,'') AS title,
             employee.department_id,
             COALESCE(sum(${leaderboardScoreSql}),0) AS amount,
             COALESCE(sum(${leaderboardScoreSql}) FILTER (
               WHERE achievement.occurred_at <
                 (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
             ),0) AS previous_amount
        FROM app.employees employee
        JOIN app.users account_user
          ON account_user.id=employee.user_id
         AND account_user.account_status='Approved'
        LEFT JOIN app.positions position ON position.id=employee.position_id
        JOIN LATERAL (
          SELECT role.code
            FROM app.role_assignments assignment
            JOIN app.roles role ON role.id=assignment.role_id
           WHERE assignment.user_id=account_user.id
             AND assignment.starts_at<=clock_timestamp()
             AND (assignment.ends_at IS NULL OR assignment.ends_at>clock_timestamp())
           ORDER BY assignment.starts_at DESC
           LIMIT 1
        ) active_role ON true
        LEFT JOIN app.achievements achievement
          ON achievement.employee_id=employee.id
         AND achievement.spark_type<>'Radiant'
         AND (
           achievement.source_type<>'PerformanceRecord'
           OR EXISTS (
             SELECT 1 FROM app.performance_records current_performance
              WHERE current_performance.id=achievement.source_id
                AND current_performance.status<>'Superseded'
           )
         )
       WHERE employee.is_active
         AND active_role.code=ANY(ARRAY['Employee','Coordinator','GPM','Head','Top Management']::text[])
         AND ($1::uuid IS NULL OR EXISTS (
           SELECT 1 FROM app.employee_departments membership
            WHERE membership.employee_id=employee.id AND membership.department_id=$1
         ))
       GROUP BY employee.id,employee.display_name,position.title,employee.department_id
       ORDER BY employee.display_name,employee.id`, [departmentId ?? null]),
  ]);

  return createLeaderboardResponse(
    candidateRows.map((row) => ({
      employeeId: row.employee_id,
      name: row.name,
      title: row.title,
      departmentId: row.department_id,
      amount: Number(row.amount),
      previousAmount: Number(row.previous_amount),
    })),
    principal.employeeId,
    departmentId ?? null,
    departments,
  );
};
