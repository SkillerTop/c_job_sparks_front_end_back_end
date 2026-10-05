import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal } from './domain.js';
import { quarterForDate } from './domain.js';
import { effectiveRuleSet } from './economy.js';
import { rows } from './sql.js';

const date = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : '');

export const buildWorkspace = async (db: PoolClient, principal: AuthenticatedPrincipal) => {
  const [categoriesRaw, employeesRaw, departmentsRaw, projectsRaw, transactionsRaw, recognitionsRaw, awardsRaw,
    gatesRaw, performanceRaw, achievementsRaw, disenchantRaw, auditRaw, rule] = await Promise.all([
    rows<any>(db, `
      SELECT c.id, v.name, COALESCE(v.description,'') AS description, c.spark_type, v.amount,
             v.repeat_period, c.is_active
        FROM app.spark_categories c
        JOIN LATERAL (
          SELECT value.* FROM app.spark_category_versions value
           WHERE value.category_id=c.id AND value.status='Active'
             AND value.effective_from<=clock_timestamp()
             AND (value.effective_to IS NULL OR value.effective_to>clock_timestamp())
           ORDER BY value.version DESC LIMIT 1
        ) v ON true ORDER BY c.spark_type, v.name`),
    rows<any>(db, `
      SELECT e.id, e.display_name, e.first_name, e.last_name, COALESCE(pos.title,'') AS title,
             e.department_id, COALESCE(role.code,e.provisioned_role_code) AS role, COALESCE(e.contact_email,u.email)::text AS email,
             e.is_active, e.manager_employee_id,
             EXISTS (SELECT 1 FROM app.project_teams team WHERE team.coordinator_employee_id=e.id) AS coordination
        FROM app.employees e LEFT JOIN app.users u ON u.id=e.user_id
        LEFT JOIN app.positions pos ON pos.id=e.position_id
        LEFT JOIN LATERAL (
          SELECT r.code FROM app.role_assignments ra JOIN app.roles r ON r.id=ra.role_id
           WHERE ra.user_id=u.id AND ra.starts_at<=clock_timestamp()
             AND (ra.ends_at IS NULL OR ra.ends_at>clock_timestamp()) LIMIT 1
        ) role ON true
       WHERE e.is_active ORDER BY e.display_name`),
    rows<any>(db, `SELECT id, name, head_employee_id, is_active FROM app.departments ORDER BY name`),
    rows<any>(db, `
      SELECT p.id, p.name, COALESCE(team.gpm_employee_id,p.manager_employee_id) AS gpm_id,
             p.is_active, member.employee_id, COALESCE(member.member_role,'Member') AS responsibility,
             member.worked_hours
        FROM app.projects p LEFT JOIN app.project_teams team ON team.project_id=p.id AND team.is_active
        LEFT JOIN app.project_members member ON member.project_id=p.id AND member.is_active
       WHERE $1='Administrator' OR p.department_id=$2 OR p.manager_employee_id=$3
          OR team.gpm_employee_id=$3 OR member.employee_id=$3
       ORDER BY p.name`, [principal.role, principal.departmentId, principal.employeeId]),
    rows<any>(db, `
      SELECT le.id::text, sa.employee_id, e.department_id, le.occurred_at, sa.spark_type,
             le.amount, le.entry_kind, COALESCE(op.source_type,le.source_type,'System') AS source,
             COALESCE(cv.name,op.description,'Spark operation') AS category,
             c.id AS category_id, COALESCE(le.description,op.description,'') AS description,
             op.actor_user_id, op.source_id,
             CASE WHEN EXISTS (SELECT 1 FROM app.spark_operations reversal
               WHERE reversal.reversal_of_operation_id=op.id AND reversal.status='Committed')
               THEN 'Reversed' ELSE op.status END AS status
        FROM app.spark_ledger_entries le JOIN app.spark_accounts sa ON sa.id=le.account_id
        JOIN app.employees e ON e.id=sa.employee_id JOIN app.spark_operations op ON op.id=le.operation_id
        LEFT JOIN app.spark_category_versions cv ON cv.id=le.category_version_id
        LEFT JOIN app.spark_categories c ON c.id=cv.category_id
       WHERE sa.employee_id=$1 ORDER BY le.occurred_at DESC, le.id DESC LIMIT 500`, [principal.employeeId]),
    rows<any>(db, `
      SELECT r.*, cv.name AS category, c.id AS category_id
        FROM app.recognitions r JOIN app.spark_category_versions cv ON cv.id=r.category_version_id
        JOIN app.spark_categories c ON c.id=cv.category_id
       WHERE r.nominator_employee_id=$1 OR r.recipient_employee_id=$1
          OR ($2='Head' AND r.recipient_department_id=$3)
       ORDER BY r.requested_at DESC`, [principal.employeeId, principal.role, principal.departmentId]),
    rows<any>(db, `
      SELECT a.*, COALESCE(cv.name,a.metadata->>'radiantReason',a.spark_type || ' Award') AS category,
             c.id AS category_id
        FROM app.award_requests a LEFT JOIN app.spark_category_versions cv ON cv.id=a.category_version_id
        LEFT JOIN app.spark_categories c ON c.id=cv.category_id
       WHERE a.requested_by_employee_id=$1 OR a.recipient_employee_id=$1
          OR ($2='Head' AND a.recipient_department_id=$3)
       ORDER BY a.requested_at DESC`, [principal.employeeId, principal.role, principal.departmentId]),
    rows<any>(db, `
      SELECT * FROM app.quality_gates
       WHERE employee_id=$1 OR ($2='Head' AND department_id=$3)
       ORDER BY created_at DESC`, [principal.employeeId, principal.role, principal.departmentId]),
    rows<any>(db, `SELECT * FROM app.performance_records WHERE employee_id=$1 ORDER BY period_start DESC`, [principal.employeeId]),
    rows<any>(db, `
      SELECT achievement.*, COALESCE(actor.display_name,'System') AS awarded_by_name,
             cv.name AS category
        FROM app.achievements achievement
        LEFT JOIN app.users au ON au.id=achievement.awarded_by_user_id
        LEFT JOIN app.employees actor ON actor.user_id=au.id
        LEFT JOIN app.spark_category_versions cv ON cv.id=achievement.category_version_id
       WHERE achievement.employee_id=$1
          OR ($2=ANY(ARRAY['GPM','Top Management','Administrator']) AND achievement.achievement_type='Company')
       ORDER BY achievement.occurred_at DESC`, [principal.employeeId, principal.role]),
    rows<any>(db, `
      SELECT * FROM app.disenchant_requests
       WHERE employee_id=$1 OR ($2='Head' AND department_id=$3) OR $2='Administrator'
       ORDER BY created_at DESC`, [principal.employeeId, principal.role, principal.departmentId]),
    principal.role === 'Administrator'
      ? rows<any>(db, `SELECT * FROM app.audit_events ORDER BY occurred_at DESC LIMIT 500`)
      : Promise.resolve([]),
    effectiveRuleSet(db),
  ]);

  const projects = new Map<string, any>();
  for (const row of projectsRaw) {
    const project = projects.get(row.id) ?? {
      id: row.id,
      name: row.name,
      gpmId: row.gpm_id ?? '',
      active: row.is_active,
      members: [],
    };
    if (row.employee_id)
      project.members.push({
        employeeId: row.employee_id,
        responsibility: ['Coordinator', 'Registrar'].includes(row.responsibility) ? row.responsibility : 'Member',
        workedHours: Number(row.worked_hours),
      });
    projects.set(row.id, project);
  }
  const categoryPeriods: Record<string, string> = {
    Unlimited: 'Unrestricted', Quarterly: 'Quarterly', Yearly: 'Yearly', OneTime: 'One-time',
  };
  return {
    categories: categoriesRaw.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      sparkType: row.spark_type,
      amount: Number(row.amount),
      period: categoryPeriods[row.repeat_period],
      active: row.is_active,
    })),
    employees: employeesRaw.map((row) => ({
      id: row.id,
      name: row.display_name,
      initials: `${row.first_name?.[0] ?? ''}${row.last_name?.[0] ?? ''}`.toUpperCase(),
      title: row.title,
      departmentId: row.department_id,
      role: row.role ?? 'Employee',
      email: row.email ?? '',
      active: row.is_active,
      hasCoordinationExperience: row.coordination,
      ...(row.manager_employee_id ? { managerId: row.manager_employee_id } : {}),
    })),
    departments: departmentsRaw.map((row) => ({
      id: row.id, name: row.name, headId: row.head_employee_id ?? '', active: row.is_active,
    })),
    projectTeams: [...projects.values()],
    transactions: transactionsRaw.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      departmentId: row.department_id,
      dateTime: date(row.occurred_at),
      sparkType: row.spark_type,
      amount: Number(row.amount),
      transactionType: Number(row.amount) > 0 ? 'Credit' : 'Debit',
      source: row.source,
      category: row.category,
      categoryId: row.category_id,
      description: row.description,
      quarter: quarterForDate(row.occurred_at),
      relatedRequestId: row.source_id,
      status: row.status === 'Reversed' ? 'Reversed' : 'Completed',
    })),
    recognitions: recognitionsRaw.map((row) => ({
      id: row.id,
      senderId: row.nominator_employee_id,
      recipientId: row.recipient_employee_id,
      category: row.category,
      categoryId: row.category_id,
      description: row.description,
      createdAt: date(row.requested_at),
      status: row.status,
      rejectionReason: row.rejection_reason ?? undefined,
    })),
    awardRequests: awardsRaw.map((row) => ({
      id: row.id,
      employeeId: row.recipient_employee_id,
      awardedBy: row.requested_by_employee_id,
      sparkType: row.spark_type,
      amount: Number(row.spark_amount),
      category: row.category,
      categoryId: row.category_id,
      description: row.description,
      createdAt: date(row.requested_at),
      status: row.status,
      source: 'Award',
      rejectionReason: row.rejection_reason ?? undefined,
    })),
    qualityGates: gatesRaw.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      startDate: String(row.starts_on).slice(0, 10),
      endDate: String(row.ends_on).slice(0, 10),
      reason: row.reason,
      createdBy: row.created_by_user_id,
      status: row.status,
    })),
    performance: performanceRaw.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      quarter: quarterForDate(row.period_start),
      kpi: Number(row.metadata?.KPI ?? 0),
      evaluation: Number(row.metadata?.Evaluation ?? 0),
      kpiReward: row.status === 'Awarded' ? Number(row.metadata?.KPIReward ?? 0) : 0,
      evaluationReward: row.status === 'Awarded' ? Number(row.metadata?.EvaluationReward ?? 0) : 0,
      kpiImported: row.source_type === 'CsvImport',
    })),
    achievements: achievementsRaw.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      title: row.title,
      description: row.description ?? '',
      sparkType: row.spark_type ?? 'White',
      category: row.category ?? row.achievement_type,
      date: date(row.occurred_at),
      awardedBy: row.awarded_by_name,
    })),
    disenchantRequests: disenchantRaw.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      departmentId: row.department_id,
      sparkType: row.spark_type,
      amount: Number(row.spark_amount),
      rate: Number(row.rate_snapshot),
      moneyValue: Number(row.money_amount),
      currency: row.currency,
      createdAt: date(row.created_at),
      accountingPeriod: date(row.created_at).slice(0, 7),
      status: row.status,
    })),
    auditEvents: auditRaw.map((row) => ({
      id: String(row.id),
      action: row.action,
      actorId: row.actor_user_id ?? 'system',
      subjectId: row.entity_id,
      dateTime: date(row.occurred_at),
      details: row.reason ?? row.action,
    })),
    settings: {
      currentQuarter: quarterForDate(),
      whiteToYellow: Number(rule.white_to_yellow_input),
      yellowToBlue: Number(rule.yellow_to_blue_input),
      conversionFee: Number(rule.white_to_yellow_fee),
      yellowQuarterlyLimit: Number(rule.yellow_quarterly_limit),
      peerBaseLimit: Number(rule.peer_quarterly_limit),
      coordinatorTeamMultiplier: Number(rule.coordinator_team_multiplier),
      disenchantRate: 1,
      currency: rule.disenchant_currency,
      sparkMoneyValues: {
        White: Number(rule.white_disenchant_rate),
        Yellow: Number(rule.yellow_disenchant_rate),
        Blue: Number(rule.blue_disenchant_rate),
      },
    },
  };
};
