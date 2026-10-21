import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal } from './domain.js';
import { hasFullPersonalLedger, quarterForDate } from './domain.js';
import { effectiveRuleSet } from './economy.js';
import { performanceThresholdsFromConfiguration } from './performance-rules.js';
import { rows } from './sql.js';

const date = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : '');
const dateOnly = (value: Date | string | null | undefined) => {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const postgresDate = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return postgresDate?.[1] ?? new Date(value).toISOString().slice(0, 10);
};

const inSequence = async <const T extends readonly (() => Promise<unknown>)[]>(tasks: T) => {
  const results: unknown[] = [];
  for (const task of tasks) results.push(await task());
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
};

export const buildWorkspaceLayout = async (db: PoolClient, principal: AuthenticatedPrincipal) => {
  const [employeesRaw, departmentsRaw, balanceRows, pending, rule, activeEffectsRaw] = await inSequence([
    () => rows<any>(db, `
      SELECT e.id,e.display_name,e.first_name,e.last_name,COALESCE(position.title,'') AS title,
             e.department_id,COALESCE(active_role.code,e.provisioned_role_code) AS role,
             COALESCE(e.contact_email,account_user.email)::text AS email,e.is_active,e.manager_employee_id,
             microsoft_identity.claims#>>'{manager,displayName}' AS microsoft_manager_name,
             microsoft_identity.claims#>>'{manager,email}' AS microsoft_manager_email,
             EXISTS (SELECT 1 FROM app.project_teams team WHERE team.coordinator_employee_id=e.id) AS coordination
        FROM app.employees e
        LEFT JOIN app.users account_user ON account_user.id=e.user_id
        LEFT JOIN app.positions position ON position.id=e.position_id
        LEFT JOIN app.external_identities microsoft_identity
          ON microsoft_identity.user_id=account_user.id AND microsoft_identity.provider='microsoft'
        LEFT JOIN LATERAL (
          SELECT role.code FROM app.role_assignments assignment
          JOIN app.roles role ON role.id=assignment.role_id
          WHERE assignment.user_id=account_user.id AND assignment.starts_at<=clock_timestamp()
            AND (assignment.ends_at IS NULL OR assignment.ends_at>clock_timestamp())
          ORDER BY assignment.starts_at DESC LIMIT 1
        ) active_role ON true
       WHERE e.id=$1 OR e.id=(SELECT manager_employee_id FROM app.employees WHERE id=$1)
       ORDER BY (e.id=$1) DESC,e.display_name`, [principal.employeeId]),
    () => rows<any>(db, `SELECT id,name,head_employee_id,is_active FROM app.departments WHERE id=$1`,
      [principal.departmentId]),
    () => rows<any>(db, `SELECT spark_type,balance FROM app.spark_accounts WHERE employee_id=$1`,
      [principal.employeeId]),
    () => rows<any>(db, `SELECT
      (SELECT count(*)::int FROM app.recognitions WHERE status='Pending' AND recipient_department_id=$1) +
      (SELECT count(*)::int FROM app.award_requests WHERE status='Pending' AND recipient_department_id=$1)
        AS pending_approvals,
      (SELECT count(*)::int FROM app.disenchant_requests
        WHERE status IN ('Created','Exported') AND department_id=$1) AS pending_disenchant`,
      [principal.departmentId]),
    () => effectiveRuleSet(db),
    () => rows<{ effect_code: string }>(db, `SELECT DISTINCT effect_code FROM app.effect_grants
      WHERE employee_id=$1 AND revoked_at IS NULL AND starts_at<=clock_timestamp()
        AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [principal.employeeId]),
  ] as const);
  const activeEffectCodes = new Set(activeEffectsRaw.map((row) => row.effect_code));
  const balances = { White: 0, Yellow: 0, Blue: 0, Radiant: 0 };
  for (const row of balanceRows) balances[row.spark_type as keyof typeof balances] = Number(row.balance);
  return {
    shell: {
      balances,
      pendingApprovals: principal.role === 'Head' ? Number(pending[0]?.pending_approvals ?? 0) : 0,
      pendingDisenchant: principal.role === 'Head' ? Number(pending[0]?.pending_disenchant ?? 0) : 0,
    },
    categories: [],
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
      ...(row.microsoft_manager_name ? { managerName: row.microsoft_manager_name } : {}),
      ...(row.microsoft_manager_email ? { managerEmail: row.microsoft_manager_email } : {}),
    })),
    departments: departmentsRaw.map((row) => ({
      id: row.id,name: row.name,headId: row.head_employee_id ?? '',active: row.is_active,
    })),
    projectTeams: [],transactions: [],departmentBalances: {},recognitions: [],awardRequests: [],
    qualityGates: [],performance: [],achievements: [],disenchantRequests: [],disenchantReports: [],
    fulfillmentContacts: [],auditEvents: [],
    shopEffects: {
      doubleWhiteSparks: activeEffectCodes.has('double_white'),
      focusMode: activeEffectCodes.has('focus_mode'),
      goldenProfileFrame: activeEffectCodes.has('profile_frame'),
      neonTheme: activeEffectCodes.has('theme_unlock'),
      signatureBadge: activeEffectCodes.has('badge_unlock'),
      vipStatus: false,
    },
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
      performanceThresholds: performanceThresholdsFromConfiguration(rule.configuration),
    },
  };
};

export type WorkspaceSection = 'all' | 'dashboard' | 'profile' | 'sparks' | 'recognition' | 'achievements' |
  'company-achievements' | 'shop' | 'inventory' | 'convert' | 'disenchant' | 'team' | 'award' |
  'approvals' | 'admin' | 'rules';

type WorkspaceDataset = 'categories' | 'directory' | 'projects' | 'transactions' | 'departmentBalances' |
  'recognitions' | 'awards' | 'gates' | 'performance' | 'achievements' | 'disenchant' | 'audit' |
  'fulfillment' | 'reports' | 'effects';

const sectionDatasets: Record<Exclude<WorkspaceSection, 'all'>, readonly WorkspaceDataset[]> = {
  dashboard: ['directory','transactions','recognitions','awards','performance','achievements','effects'],
  profile: ['directory','effects'],
  sparks: ['directory','transactions','effects'],
  recognition: ['categories','directory','projects','recognitions','effects'],
  achievements: ['directory','transactions','performance','achievements','effects'],
  'company-achievements': ['directory','achievements','effects'],
  shop: ['directory','effects'],
  inventory: ['directory','effects'],
  convert: ['directory','transactions','effects'],
  disenchant: ['directory','transactions','disenchant','reports','effects'],
  team: ['directory','projects','departmentBalances','recognitions','awards','gates','disenchant','effects'],
  award: ['categories','directory','projects','awards','fulfillment','effects'],
  approvals: ['directory','recognitions','awards','gates','disenchant','effects'],
  admin: ['categories','directory','projects','transactions','recognitions','awards','gates','performance',
    'achievements','disenchant','audit','fulfillment','reports','effects'],
  rules: ['categories','effects'],
};

export const buildWorkspace = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  section: WorkspaceSection = 'all',
) => {
  const include = (dataset: WorkspaceDataset) => dataset === 'directory' || section === 'all' ||
    sectionDatasets[section].includes(dataset);
  const wideDirectory = section === 'all' || ['recognition','company-achievements','team','award','approvals','admin']
    .includes(section);
  const [categoriesRaw, employeesRaw, departmentsRaw, projectsRaw, transactionsRaw, departmentBalancesRaw,
    recognitionsRaw, awardsRaw,
    gatesRaw, performanceRaw, achievementsRaw, disenchantRaw, auditRaw, rule, fulfillmentContactsRaw,
    disenchantReportsRaw, activeEffectsRaw] = await inSequence([
    () => include('categories') ? rows<any>(db, `
      SELECT c.id, v.name, COALESCE(v.description,'') AS description, c.spark_type, c.usage_type,
             v.amount, v.repeat_period, c.is_active
        FROM app.spark_categories c
        JOIN LATERAL (
          SELECT value.* FROM app.spark_category_versions value
           WHERE value.category_id=c.id AND value.status='Active'
             AND value.effective_from<=clock_timestamp()
             AND (value.effective_to IS NULL OR value.effective_to>clock_timestamp())
           ORDER BY value.version DESC LIMIT 1
        ) v ON true ORDER BY c.spark_type, v.name`) : Promise.resolve([]),
    () => include('directory') ? rows<any>(db, `
      SELECT e.id, e.display_name, e.first_name, e.last_name, COALESCE(pos.title,'') AS title,
             e.department_id, COALESCE(role.code,e.provisioned_role_code) AS role, COALESCE(e.contact_email,u.email)::text AS email,
             e.is_active, e.manager_employee_id,
             microsoft_identity.claims#>>'{manager,displayName}' AS microsoft_manager_name,
             microsoft_identity.claims#>>'{manager,email}' AS microsoft_manager_email,
             EXISTS (SELECT 1 FROM app.project_teams team WHERE team.coordinator_employee_id=e.id) AS coordination
        FROM app.employees e LEFT JOIN app.users u ON u.id=e.user_id
        LEFT JOIN app.positions pos ON pos.id=e.position_id
        LEFT JOIN app.external_identities microsoft_identity
          ON microsoft_identity.user_id=u.id AND microsoft_identity.provider='microsoft'
        LEFT JOIN LATERAL (
          SELECT r.code FROM app.role_assignments ra JOIN app.roles r ON r.id=ra.role_id
           WHERE ra.user_id=u.id AND ra.starts_at<=clock_timestamp()
             AND (ra.ends_at IS NULL OR ra.ends_at>clock_timestamp()) LIMIT 1
        ) role ON true
       WHERE e.is_active AND ($2 OR e.id=$1 OR e.id=(SELECT manager_employee_id FROM app.employees WHERE id=$1))
       ORDER BY e.display_name`, [principal.employeeId, wideDirectory]) : Promise.resolve([]),
    () => include('directory') ? rows<any>(db, `SELECT id,name,head_employee_id,is_active FROM app.departments
      WHERE $1 OR id=$2 ORDER BY name`, [wideDirectory, principal.departmentId]) : Promise.resolve([]),
    () => include('projects') ? rows<any>(db, `
      SELECT p.id, p.name, COALESCE(team.gpm_employee_id,p.manager_employee_id) AS gpm_id,
             p.is_active, member.employee_id, COALESCE(member.member_role,'Member') AS responsibility,
             member.worked_hours
        FROM app.projects p LEFT JOIN app.project_teams team ON team.project_id=p.id AND team.is_active
        LEFT JOIN app.project_members member ON member.project_id=p.id AND member.is_active
       WHERE $1='Administrator' OR p.department_id=$2 OR p.manager_employee_id=$3
          OR team.gpm_employee_id=$3 OR member.employee_id=$3
       ORDER BY p.name`, [principal.role, principal.departmentId, principal.employeeId]) : Promise.resolve([]),
    () => include('transactions') ? rows<any>(db, `
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
       WHERE sa.employee_id=$1 AND ($2 OR sa.spark_type='Radiant')
       ORDER BY le.occurred_at DESC, le.id DESC LIMIT 500`,
      [principal.employeeId, hasFullPersonalLedger(principal.role)]) : Promise.resolve([]),
    () => include('departmentBalances') && principal.role === 'Head'
      ? rows<any>(db, `
          SELECT employee.id AS employee_id, spark_type.value AS spark_type, COALESCE(account.balance,0) AS balance
            FROM app.employees employee
            CROSS JOIN unnest(ARRAY['White','Yellow','Blue','Radiant']::text[]) AS spark_type(value)
            LEFT JOIN app.spark_accounts account
              ON account.employee_id=employee.id AND account.spark_type=spark_type.value
           WHERE employee.department_id=$1 AND employee.is_active
           ORDER BY employee.id, spark_type.value`, [principal.departmentId])
      : Promise.resolve([]),
    () => include('recognitions') ? rows<any>(db, `
      SELECT r.*, cv.name AS category, c.id AS category_id
        FROM app.recognitions r JOIN app.spark_category_versions cv ON cv.id=r.category_version_id
        JOIN app.spark_categories c ON c.id=cv.category_id
       WHERE r.nominator_employee_id=$1 OR r.recipient_employee_id=$1
          OR ($2='Head' AND r.recipient_department_id=$3)
       ORDER BY r.requested_at DESC LIMIT 200`, [principal.employeeId, principal.role, principal.departmentId]) : Promise.resolve([]),
    () => include('awards') ? rows<any>(db, `
      SELECT a.*, COALESCE(cv.name,a.metadata->>'radiantReason',a.spark_type || ' Award') AS category,
             c.id AS category_id
        FROM app.award_requests a LEFT JOIN app.spark_category_versions cv ON cv.id=a.category_version_id
        LEFT JOIN app.spark_categories c ON c.id=cv.category_id
       WHERE a.requested_by_employee_id=$1 OR a.recipient_employee_id=$1
          OR ($2='Head' AND a.recipient_department_id=$3)
       ORDER BY a.requested_at DESC LIMIT 200`, [principal.employeeId, principal.role, principal.departmentId]) : Promise.resolve([]),
    () => include('gates') ? rows<any>(db, `
      SELECT gate.*, gate.starts_on::text AS starts_on, gate.ends_on::text AS ends_on
        FROM app.quality_gates gate
       WHERE employee_id=$1 OR ($2='Head' AND department_id=$3)
       ORDER BY created_at DESC LIMIT 200`, [principal.employeeId, principal.role, principal.departmentId]) : Promise.resolve([]),
    () => include('performance') ? rows<any>(db, `SELECT * FROM app.performance_records
      WHERE employee_id=$1 AND status<>'Superseded'
      ORDER BY period_start DESC, created_at DESC LIMIT 200`, [principal.employeeId]) : Promise.resolve([]),
    () => include('achievements') ? rows<any>(db, `
      SELECT achievement.*, COALESCE(actor.display_name,'System') AS awarded_by_name,
             cv.name AS category
        FROM app.achievements achievement
        LEFT JOIN app.users au ON au.id=achievement.awarded_by_user_id
        LEFT JOIN app.employees actor ON actor.user_id=au.id
        LEFT JOIN app.spark_category_versions cv ON cv.id=achievement.category_version_id
       WHERE (
          achievement.source_type<>'PerformanceRecord'
          OR EXISTS (
            SELECT 1 FROM app.performance_records current_performance
             WHERE current_performance.id=achievement.source_id
               AND current_performance.status<>'Superseded'
          )
       ) AND (
          achievement.employee_id=$1
          OR $2=ANY(ARRAY['GPM','Head','Top Management','Administrator'])
       )
       ORDER BY achievement.occurred_at DESC LIMIT 200`, [principal.employeeId, principal.role]) : Promise.resolve([]),
    () => include('disenchant') ? rows<any>(db, `
      SELECT request.*, employee.display_name AS employee_name
        FROM app.disenchant_requests request
        LEFT JOIN app.employees employee ON employee.id=request.employee_id
       WHERE request.employee_id=$1 OR ($2='Head' AND request.department_id=$3) OR $2='Administrator'
       ORDER BY request.created_at DESC LIMIT 200`, [principal.employeeId, principal.role, principal.departmentId]) : Promise.resolve([]),
    () => include('audit') && principal.role === 'Administrator'
      ? rows<any>(db, `SELECT * FROM app.audit_events ORDER BY occurred_at DESC LIMIT 500`)
      : Promise.resolve([]),
    () => effectiveRuleSet(db),
    () => include('fulfillment') ? rows<any>(db, `SELECT id,display_name,email::text,contact_role,office_name
      FROM app.reward_fulfillment_contacts WHERE is_active ORDER BY sort_order,display_name`) : Promise.resolve([]),
    () => include('reports') && principal.role === 'Head'
      ? rows<any>(db, `SELECT report.*,count(item.disenchant_request_id)::int AS item_count,
          COALESCE(sum(item.money_amount),0)::numeric(18,2) AS money_total
          FROM app.disenchant_reports report LEFT JOIN app.disenchant_report_items item ON item.report_id=report.id
          WHERE report.department_id=$1 GROUP BY report.id ORDER BY report.report_month DESC LIMIT 120`, [principal.departmentId])
      : Promise.resolve([]),
    () => include('effects') ? rows<{ effect_code: string }>(db, `
      SELECT DISTINCT effect_code
        FROM app.effect_grants
       WHERE employee_id=$1 AND revoked_at IS NULL
         AND starts_at<=clock_timestamp()
         AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [principal.employeeId]) : Promise.resolve([]),
  ] as const);

  const activeEffectCodes = new Set(activeEffectsRaw.map((row) => row.effect_code));

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
      usageType: row.usage_type,
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
      ...(row.microsoft_manager_name ? { managerName: row.microsoft_manager_name } : {}),
      ...(row.microsoft_manager_email ? { managerEmail: row.microsoft_manager_email } : {}),
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
    departmentBalances: departmentBalancesRaw.reduce<Record<string, Record<string, number>>>((balances, row) => {
      balances[row.employee_id] ??= { White: 0, Yellow: 0, Blue: 0, Radiant: 0 };
      balances[row.employee_id]![row.spark_type] = Number(row.balance ?? 0);
      return balances;
    }, {}),
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
      startDate: dateOnly(row.starts_on),
      endDate: dateOnly(row.ends_on),
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
      kpiImported: row.metadata?.KPIImported === true,
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
      employeeName: row.employee_name ?? undefined,
    })),
    fulfillmentContacts: fulfillmentContactsRaw.map((row) => ({
      id: row.id,
      name: row.display_name,
      email: row.email,
      role: row.contact_role,
      officeName: row.office_name,
    })),
    disenchantReports: disenchantReportsRaw.map((row) => ({
      id: row.id,
      reportMonth: dateOnly(row.report_month).slice(0, 7),
      rangeStartedAt: row.range_started_at ? date(row.range_started_at) : null,
      rangeEndedAt: date(row.range_ended_at),
      status: row.status,
      itemCount: Number(row.item_count),
      moneyTotal: Number(row.money_total),
      createdAt: date(row.created_at),
    })),
    auditEvents: auditRaw.map((row) => ({
      id: String(row.id),
      action: row.action,
      actorId: row.actor_user_id ?? 'system',
      subjectId: row.entity_id,
      dateTime: date(row.occurred_at),
      details: row.reason ?? row.action,
    })),
    shopEffects: {
      doubleWhiteSparks: activeEffectCodes.has('double_white'),
      focusMode: activeEffectCodes.has('focus_mode'),
      goldenProfileFrame: activeEffectCodes.has('profile_frame'),
      neonTheme: activeEffectCodes.has('theme_unlock'),
      signatureBadge: activeEffectCodes.has('badge_unlock'),
      vipStatus: false,
    },
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
      performanceThresholds: performanceThresholdsFromConfiguration(rule.configuration),
    },
  };
};
