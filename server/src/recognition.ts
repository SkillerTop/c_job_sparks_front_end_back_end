import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthenticatedPrincipal, Role, SparkType } from './domain.js';
import { allowedAwardTypes, gpmWhiteQuota, peerRecognitionQuota, quarterForDate } from './domain.js';
import { badRequest, conflict, forbidden, notFound } from './errors.js';
import { effectiveRuleSet } from './economy.js';
import { postLedgerOperation } from './ledger.js';
import { one, rows } from './sql.js';

interface CategoryRow {
  category_id: string;
  code: string;
  category_version_id: string;
  name: string;
  description: string | null;
  spark_type: SparkType;
  usage_type: string;
  amount: string | number;
  repeat_period: 'Unlimited' | 'Quarterly' | 'Yearly' | 'OneTime';
}

interface EmployeeRow {
  id: string;
  department_id: string;
  display_name: string;
  role: Role;
}

const activeCategory = async (db: PoolClient, categoryId: string, usageTypes: string[]) => {
  const result = await db.query<CategoryRow>(
    `SELECT c.id AS category_id, c.code, v.id AS category_version_id, v.name, v.description,
            c.spark_type, c.usage_type, v.amount, v.repeat_period
       FROM app.spark_categories c
       JOIN LATERAL (
         SELECT value.* FROM app.spark_category_versions value
          WHERE value.category_id=c.id AND value.status='Active'
            AND value.effective_from <= clock_timestamp()
            AND (value.effective_to IS NULL OR value.effective_to > clock_timestamp())
          ORDER BY value.version DESC LIMIT 1
       ) v ON true
      WHERE c.id=$1 AND c.is_active AND c.usage_type=ANY($2::text[])`,
    [categoryId, usageTypes],
  );
  if (!result.rows[0]) throw notFound('Active Spark category');
  return result.rows[0];
};

const employeeWithRole = async (db: PoolClient, employeeId: string) => {
  const result = await db.query<EmployeeRow>(
    `SELECT e.id, e.department_id, e.display_name, role.code AS role
       FROM app.employees e
       JOIN app.users u ON u.id=e.user_id AND u.account_status='Approved'
       JOIN LATERAL (
         SELECT r.code FROM app.role_assignments ra JOIN app.roles r ON r.id=ra.role_id
          WHERE ra.user_id=u.id AND ra.starts_at <= clock_timestamp()
            AND (ra.ends_at IS NULL OR ra.ends_at > clock_timestamp())
          ORDER BY ra.starts_at DESC LIMIT 1
       ) role ON true
      WHERE e.id=$1 AND e.is_active`,
    [employeeId],
  );
  if (!result.rows[0]) throw notFound('Active employee');
  return result.rows[0];
};

const quarterDates = () => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

const assertPeerRecipient = (principal: AuthenticatedPrincipal, recipient: EmployeeRow) => {
  if (!['Employee', 'Coordinator', 'GPM'].includes(principal.role)) throw forbidden();
  if (!['Employee', 'Coordinator', 'GPM'].includes(recipient.role))
    throw badRequest('RECIPIENT_NOT_ELIGIBLE', 'Choose an eligible active colleague.');
  if (principal.employeeId === recipient.id)
    throw badRequest('SELF_RECOGNITION', 'Self-recognition is not allowed.');
};

const sharedWorkedColleagues = async (db: PoolClient, employeeId: string) => {
  const result = await one<{ count: string | number }>(
    db,
    `SELECT count(DISTINCT colleague.employee_id) AS count
       FROM app.project_members actor
       JOIN app.projects p ON p.id=actor.project_id AND p.is_active AND p.status='Active'
       JOIN app.project_members colleague ON colleague.project_id=actor.project_id
        AND colleague.is_active AND colleague.worked_hours > 0 AND colleague.employee_id<>actor.employee_id
      WHERE actor.employee_id=$1 AND actor.is_active AND actor.worked_hours > 0`,
    [employeeId],
  );
  return Number(result.count);
};

export const createRecognition = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  input: { recipientId: string; categoryId: string; description: string },
  requestId: string,
) => {
  const description = input.description.trim();
  if (!description) throw badRequest('DESCRIPTION_REQUIRED', 'Describe the contribution.');
  const recipient = await employeeWithRole(db, input.recipientId);
  assertPeerRecipient(principal, recipient);
  const category = await activeCategory(db, input.categoryId, ['PeerRecognition']);
  if (category.spark_type !== 'White') throw badRequest('INVALID_CATEGORY', 'Peer recognition must use a White category.');
  const rules = await effectiveRuleSet(db);
  const period = quarterDates();
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `peer:${principal.employeeId}:${period.start}`,
  ]);
  const controlled = principal.role === 'Coordinator' ? await sharedWorkedColleagues(db, principal.employeeId) : 0;
  const limit = peerRecognitionQuota(
    principal.role,
    Number(rules.peer_quarterly_limit),
    controlled,
    Number(rules.coordinator_team_multiplier),
  );
  const used = await one<{ count: string | number }>(
    db,
    `SELECT COALESCE(sum(amount),0) AS count FROM app.quota_reservations
      WHERE owner_employee_id=$1 AND subject_type='Recognition'
        AND period_start=$2 AND status IN ('Reserved','Consumed')`,
    [principal.employeeId, period.start],
  );
  if (Number(used.count) >= limit)
    throw conflict('QUOTA_EXHAUSTED', 'Your Peer Recognition quota is used or reserved for this quarter.', {
      limit,
      used: Number(used.count),
    });
  const id = randomUUID();
  await db.query(
    `INSERT INTO app.recognitions
      (id, nominator_employee_id, recipient_employee_id, recipient_department_id,
       category_version_id, rule_set_version_id, description, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      principal.employeeId,
      recipient.id,
      recipient.department_id,
      category.category_version_id,
      rules.id,
      description,
      requestId,
    ],
  );
  await db.query(
    `INSERT INTO app.quota_reservations
      (subject_type, subject_id, owner_employee_id, category_id, spark_type,
       period_start, period_end, amount)
     VALUES ('Recognition',$1,$2,$3,'White',$4,$5,1)`,
    [id, principal.employeeId, category.category_id, period.start, period.end],
  );
  await db.query(
    `INSERT INTO app.approval_actions
      (subject_type, subject_id, action, actor_user_id, resulting_status, request_id)
     VALUES ('Recognition',$1,'Submitted',$2,'Pending',$3)`,
    [id, principal.userId, requestId],
  );
  return {
    id,
    senderId: principal.employeeId,
    recipientId: recipient.id,
    category: category.name,
    categoryId: category.category_id,
    description,
    createdAt: new Date().toISOString(),
    status: 'Pending',
  };
};

const activeQualityGate = async (db: PoolClient, employeeId: string) =>
  (
    await db.query<{ id: string }>(
      `SELECT id FROM app.quality_gates
        WHERE employee_id=$1 AND status='Active'
          AND starts_on <= CURRENT_DATE AND ends_on >= CURRENT_DATE
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [employeeId],
    )
  ).rows[0] ?? null;

export const decideRecognition = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  recognitionId: string,
  decision: 'Approved' | 'Rejected',
  reason: string,
  requestId: string,
) => {
  if (principal.role !== 'Head') throw forbidden();
  if (decision === 'Rejected' && !reason.trim())
    throw badRequest('REJECTION_REASON_REQUIRED', 'A rejection reason is required.');
  const recognition = await one<{
    id: string;
    status: string;
    recipient_employee_id: string;
    recipient_department_id: string;
    nominator_employee_id: string;
    category_version_id: string;
    spark_amount: string | number;
    rule_set_version_id: string;
    description: string;
  }>(
    db,
    `SELECT r.*, v.amount AS spark_amount
       FROM app.recognitions r JOIN app.spark_category_versions v ON v.id=r.category_version_id
      WHERE r.id=$1 FOR UPDATE OF r`,
    [recognitionId],
  ).catch(() => {
    throw notFound('Recognition');
  });
  if (recognition.recipient_department_id !== principal.departmentId) throw forbidden('This request is outside your department.');
  if (recognition.status !== 'Pending') throw conflict('ALREADY_DECIDED', 'This recognition is no longer pending.');
  if (decision === 'Rejected') {
    await db.query(
      `UPDATE app.recognitions SET status='Rejected', decided_at=clock_timestamp(), decided_by_user_id=$2,
              rejection_reason=$3 WHERE id=$1`,
      [recognitionId, principal.userId, reason.trim()],
    );
    await db.query(
      `UPDATE app.quota_reservations SET status='Released', resolved_at=clock_timestamp()
        WHERE subject_type='Recognition' AND subject_id=$1 AND status='Reserved'`,
      [recognitionId],
    );
  } else {
    const reservation = await one<{ period_start: string; amount: string | number }>(db,
      `SELECT period_start,amount FROM app.quota_reservations
        WHERE subject_type='Recognition' AND subject_id=$1 AND status='Reserved' FOR UPDATE`, [recognitionId]);
    const currentRules = await effectiveRuleSet(db);
    const nominator = await employeeWithRole(db, recognition.nominator_employee_id);
    if (!['Employee', 'Coordinator', 'GPM'].includes(nominator.role))
      throw conflict('ROLE_CHANGED', 'The nominator is no longer eligible for Peer Recognition.');
    const controlled = nominator.role === 'Coordinator'
      ? await sharedWorkedColleagues(db, recognition.nominator_employee_id)
      : 0;
    const currentLimit = peerRecognitionQuota(nominator.role, Number(currentRules.peer_quarterly_limit), controlled,
      Number(currentRules.coordinator_team_multiplier));
    const currentUsage = await one<{ total: string | number }>(db, `SELECT COALESCE(sum(amount),0) AS total
      FROM app.quota_reservations WHERE owner_employee_id=$1 AND subject_type='Recognition' AND period_start=$2
        AND status IN ('Reserved','Consumed')`, [recognition.nominator_employee_id, reservation.period_start]);
    if (Number(currentUsage.total) > currentLimit)
      throw conflict('QUOTA_EXHAUSTED', 'The current Peer Recognition quota no longer permits this approval.');
    const gate = await activeQualityGate(db, recognition.recipient_employee_id);
    if (gate) throw conflict('QUALITY_GATE_ACTIVE', 'Approval is blocked by an active Quality Gate.');
    const ledger = await postLedgerOperation(db, {
      operationType: 'PeerRecognition',
      actorUserId: principal.userId,
      subjectEmployeeId: recognition.recipient_employee_id,
      ruleSetVersionId: recognition.rule_set_version_id,
      sourceType: 'Recognition',
      sourceId: recognitionId,
      requestId,
      description: recognition.description,
      entries: [
        {
          employeeId: recognition.recipient_employee_id,
          sparkType: 'White',
          amount: Number(recognition.spark_amount),
          entryKind: 'Credit',
          categoryVersionId: recognition.category_version_id,
          sourceType: 'Recognition',
          sourceId: recognitionId,
          description: recognition.description,
        },
      ],
    });
    await db.query(
      `UPDATE app.recognitions SET status='Approved', decided_at=clock_timestamp(), decided_by_user_id=$2,
              operation_id=$3 WHERE id=$1`,
      [recognitionId, principal.userId, ledger.operationId],
    );
    await db.query(
      `UPDATE app.quota_reservations SET status='Consumed', resolved_at=clock_timestamp()
        WHERE subject_type='Recognition' AND subject_id=$1 AND status='Reserved'`,
      [recognitionId],
    );
    await db.query(
      `INSERT INTO app.achievements
        (employee_id, achievement_type, title, description, spark_type, spark_amount,
         category_version_id, operation_id, source_type, source_id, awarded_by_user_id)
       SELECT $2,'PeerRecognition',v.name,$3,'White',$4,$5,$6,'Recognition',$1,$7
         FROM app.spark_category_versions v WHERE v.id=$5`,
      [
        recognitionId,
        recognition.recipient_employee_id,
        recognition.description,
        Number(recognition.spark_amount),
        recognition.category_version_id,
        ledger.operationId,
        principal.userId,
      ],
    );
  }
  await db.query(
    `INSERT INTO app.approval_actions
      (subject_type, subject_id, action, actor_user_id, reason, previous_status, resulting_status, request_id)
     VALUES ('Recognition',$1,$2,$3,$4,'Pending',$2,$5)`,
    [recognitionId, decision, principal.userId, reason.trim() || null, requestId],
  );
};

const canTargetAwardRecipient = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  recipient: EmployeeRow,
) => {
  if (principal.role === 'Head') return recipient.department_id === principal.departmentId;
  if (principal.role === 'Top Management') return recipient.role !== 'Administrator';
  if (principal.role === 'Coordinator') {
    const result = await db.query(
      `SELECT 1 FROM app.project_members actor
        JOIN app.projects p ON p.id=actor.project_id AND p.is_active AND p.status='Active'
        JOIN app.project_members target ON target.project_id=actor.project_id
       WHERE actor.employee_id=$1 AND target.employee_id=$2
         AND actor.is_active AND target.is_active AND actor.worked_hours>0 AND target.worked_hours>0 LIMIT 1`,
      [principal.employeeId, recipient.id],
    );
    return Boolean(result.rowCount);
  }
  if (principal.role === 'GPM') {
    const result = await db.query(
      `SELECT 1 FROM app.project_teams team
        LEFT JOIN app.project_members member ON member.team_id=team.id AND member.is_active
       WHERE team.gpm_employee_id=$1 AND team.is_active
         AND (member.employee_id=$2 OR team.coordinator_employee_id=$2) LIMIT 1`,
      [principal.employeeId, recipient.id],
    );
    return Boolean(result.rowCount);
  }
  return false;
};

const periodForCategory = (repeat: CategoryRow['repeat_period']) => {
  const now = new Date();
  if (repeat === 'Yearly' || repeat === 'OneTime')
    return {
      start: repeat === 'OneTime' ? '1970-01-01' : `${now.getUTCFullYear()}-01-01`,
      end: repeat === 'OneTime' ? '9999-12-31' : `${now.getUTCFullYear()}-12-31`,
    };
  return quarterDates();
};

export const createAward = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  input: { recipientId: string; categoryId?: string; description: string; radiantReason?: string },
  requestId: string,
) => {
  const allowed = allowedAwardTypes(principal.role);
  if (allowed.length === 0) throw forbidden();
  const recipient = await employeeWithRole(db, input.recipientId);
  if (!(await canTargetAwardRecipient(db, principal, recipient))) throw forbidden('This employee is outside your award scope.');
  const radiant = principal.role === 'Top Management';
  const category = radiant
    ? null
    : await activeCategory(db, input.categoryId ?? '', ['Award', 'Performance', 'Administrative']);
  const sparkType: SparkType = radiant ? 'Radiant' : category!.spark_type;
  const amount = radiant ? 1 : Number(category!.amount);
  if (!allowed.includes(sparkType)) throw forbidden('Your role cannot issue this Spark type.');
  const description = input.description.trim();
  if (!description) throw badRequest('DESCRIPTION_REQUIRED', 'Describe the achievement.');
  const direct = principal.role === 'Head' || principal.role === 'Top Management';
  const rules = await effectiveRuleSet(db);
  const period = radiant ? periodForCategory('Unlimited') : periodForCategory(category!.repeat_period);
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
    `award:${recipient.id}:${sparkType}:${period.start}`,
  ]);
  if (category && category.repeat_period !== 'Unlimited') {
    const duplicate = await db.query(
      `SELECT 1 FROM app.quota_reservations
        WHERE owner_employee_id=$1 AND category_id=$2 AND status IN ('Reserved','Consumed')
          AND daterange(period_start,period_end,'[]') && daterange($3::date,$4::date,'[]') LIMIT 1`,
      [recipient.id, category.category_id, period.start, period.end],
    );
    if (duplicate.rowCount) throw conflict('CATEGORY_REPEAT_LIMIT', 'This category has already been used in its repeat period.');
  }
  if (category?.code === 'employee-of-year') {
    const departmentSize = await one<{ count: string | number }>(db, `SELECT count(*) AS count FROM app.employees
      WHERE department_id=$1 AND is_active AND provisioned_role_code<>'Administrator'`, [recipient.department_id]);
    const quota = Math.floor(Number(departmentSize.count) / 10);
    const used = await one<{ count: string | number }>(db, `SELECT count(*) AS count
      FROM app.quota_reservations reservation JOIN app.award_requests award
        ON reservation.subject_type='Award' AND reservation.subject_id=award.id
      WHERE reservation.category_id=$1 AND award.recipient_department_id=$2
        AND reservation.period_start=$3 AND reservation.status IN ('Reserved','Consumed')`,
    [category.category_id, recipient.department_id, period.start]);
    if (Number(used.count) >= quota)
      throw conflict('EMPLOYEE_OF_YEAR_QUOTA',
        `Employee of the Year quota is ${quota} for ${Number(departmentSize.count)} active department employees.`);
  }
  if (sparkType === 'Yellow') {
    const reserved = await one<{ total: string | number }>(
      db,
      `SELECT COALESCE(sum(amount),0) AS total FROM app.quota_reservations
        WHERE owner_employee_id=$1 AND spark_type='Yellow' AND period_start=$2
          AND status IN ('Reserved','Consumed')`,
      [recipient.id, period.start],
    );
    if (Number(reserved.total) + amount > Number(rules.yellow_quarterly_limit))
      throw conflict('QUOTA_EXHAUSTED', 'The recipient Yellow quota is used or reserved.');
  }
  if (principal.role === 'GPM' && sparkType === 'White') {
    const coordinators = await one<{ count: string | number }>(
      db,
      `SELECT count(DISTINCT coordinator_employee_id) AS count FROM app.project_teams
        WHERE gpm_employee_id=$1 AND is_active AND coordinator_employee_id IS NOT NULL`,
      [principal.employeeId],
    );
    const capacity = gpmWhiteQuota(Number(coordinators.count), Number(rules.coordinator_team_multiplier));
    const used = await one<{ count: string | number }>(
      db,
      `SELECT COALESCE(sum(amount),0) AS count FROM app.quota_reservations
        WHERE owner_employee_id=$1 AND spark_type='White' AND period_start=$2
          AND status IN ('Reserved','Consumed')`,
      [principal.employeeId, period.start],
    );
    if (Number(used.count) >= capacity) throw conflict('QUOTA_EXHAUSTED', 'Your GPM White quota is used or reserved.');
  }
  if (direct && sparkType === 'White' && (await activeQualityGate(db, recipient.id)))
    throw conflict('QUALITY_GATE_ACTIVE', 'White credit is blocked by an active Quality Gate.');
  const id = randomUUID();
  await db.query(
    `INSERT INTO app.award_requests
      (id, requested_by_employee_id, recipient_employee_id, recipient_department_id,
       category_version_id, spark_type, spark_amount, rule_set_version_id, description,
       is_direct, status, quota_period_start, quota_period_end, requested_at,
       decided_at, decided_by_user_id, request_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,clock_timestamp(),
             CASE WHEN $10 THEN clock_timestamp() ELSE NULL END,
             CASE WHEN $10 THEN $14 ELSE NULL END,$15,$16::jsonb)`,
    [
      id,
      principal.employeeId,
      recipient.id,
      recipient.department_id,
      category?.category_version_id ?? null,
      sparkType,
      amount,
      rules.id,
      description,
      direct,
      direct ? 'Approved' : 'Pending',
      period.start,
      period.end,
      principal.userId,
      requestId,
      JSON.stringify({ radiantReason: input.radiantReason ?? null }),
    ],
  );
  if (category || sparkType !== 'Radiant') {
    await db.query(
      `INSERT INTO app.quota_reservations
        (subject_type, subject_id, owner_employee_id, category_id, spark_type,
         period_start, period_end, amount, status, resolved_at)
       VALUES ('Award',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        principal.role === 'GPM' && sparkType === 'White' ? principal.employeeId : recipient.id,
        category?.category_id ?? null,
        sparkType,
        period.start,
        period.end,
        sparkType === 'Yellow' ? amount : 1,
        direct ? 'Consumed' : 'Reserved',
        direct ? new Date() : null,
      ],
    );
  }
  let operationId: string | null = null;
  if (direct) {
    const ledger = await postLedgerOperation(db, {
      operationType: 'Award',
      actorUserId: principal.userId,
      subjectEmployeeId: recipient.id,
      ruleSetVersionId: rules.id,
      sourceType: 'Award',
      sourceId: id,
      requestId,
      description,
      entries: [
        {
          employeeId: recipient.id,
          sparkType,
          amount,
          entryKind: 'Credit',
          categoryVersionId: category?.category_version_id ?? null,
          sourceType: 'Award',
          sourceId: id,
          description,
        },
      ],
    });
    operationId = ledger.operationId;
    await db.query(`UPDATE app.award_requests SET operation_id=$2 WHERE id=$1`, [id, operationId]);
    await db.query(
      `INSERT INTO app.achievements
        (employee_id, achievement_type, title, description, spark_type, spark_amount,
         category_version_id, operation_id, source_type, source_id, awarded_by_user_id)
       VALUES ($1,'Award',$2,$3,$4,$5,$6,$7,'Award',$8,$9)`,
      [recipient.id, category?.name ?? input.radiantReason ?? 'Radiant Award', description, sparkType, amount,
        category?.category_version_id ?? null, operationId, id, principal.userId],
    );
  }
  await db.query(
    `INSERT INTO app.approval_actions
      (subject_type, subject_id, action, actor_user_id, resulting_status, request_id)
     VALUES ('Award',$1,$2,$3,$4,$5)`,
    [id, direct ? 'Approved' : 'Submitted', principal.userId, direct ? 'Approved' : 'Pending', requestId],
  );
  return {
    id,
    employeeId: recipient.id,
    awardedBy: principal.employeeId,
    sparkType,
    amount,
    category: category?.name ?? input.radiantReason ?? 'Radiant Award',
    categoryId: category?.category_id,
    description,
    createdAt: new Date().toISOString(),
    status: direct ? 'Approved' : 'Pending',
    source: `${principal.role} Award`,
  };
};

export const decideAward = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  awardId: string,
  decision: 'Approved' | 'Rejected',
  reason: string,
  requestId: string,
) => {
  if (principal.role !== 'Head') throw forbidden();
  if (decision === 'Rejected' && !reason.trim())
    throw badRequest('REJECTION_REASON_REQUIRED', 'A rejection reason is required.');
  const award = await one<{
    id: string;
    status: string;
    recipient_employee_id: string;
    recipient_department_id: string;
    requested_by_employee_id: string;
    category_version_id: string | null;
    spark_type: SparkType;
    spark_amount: string | number;
    rule_set_version_id: string;
    description: string;
  }>(db, `SELECT * FROM app.award_requests WHERE id=$1 FOR UPDATE`, [awardId]).catch(() => {
    throw notFound('Award request');
  });
  if (award.recipient_department_id !== principal.departmentId) throw forbidden('This request is outside your department.');
  if (award.status !== 'Pending') throw conflict('ALREADY_DECIDED', 'This award request is no longer pending.');
  if (decision === 'Rejected') {
    await db.query(
      `UPDATE app.award_requests SET status='Rejected', decided_at=clock_timestamp(), decided_by_user_id=$2,
              rejection_reason=$3 WHERE id=$1`,
      [awardId, principal.userId, reason.trim()],
    );
    await db.query(
      `UPDATE app.quota_reservations SET status='Released', resolved_at=clock_timestamp()
        WHERE subject_type='Award' AND subject_id=$1 AND status='Reserved'`,
      [awardId],
    );
  } else {
    const reservation = await one<{ owner_employee_id: string; period_start: string; amount: string | number }>(db,
      `SELECT owner_employee_id,period_start,amount FROM app.quota_reservations
        WHERE subject_type='Award' AND subject_id=$1 AND status='Reserved' FOR UPDATE`, [awardId]);
    const currentRules = await effectiveRuleSet(db);
    if (award.spark_type === 'Yellow') {
      const usage = await one<{ total: string | number }>(db, `SELECT COALESCE(sum(amount),0) AS total
        FROM app.quota_reservations WHERE owner_employee_id=$1 AND spark_type='Yellow' AND period_start=$2
          AND status IN ('Reserved','Consumed')`, [reservation.owner_employee_id, reservation.period_start]);
      if (Number(usage.total) > Number(currentRules.yellow_quarterly_limit))
        throw conflict('QUOTA_EXHAUSTED', 'The current Yellow quota no longer permits this approval.');
    }
    if (award.spark_type === 'White') {
      const requester = await employeeWithRole(db, award.requested_by_employee_id);
      if (requester.role === 'GPM') {
        const coordinators = await one<{ count: string | number }>(db, `SELECT count(DISTINCT coordinator_employee_id) AS count
          FROM app.project_teams WHERE gpm_employee_id=$1 AND is_active AND coordinator_employee_id IS NOT NULL`, [requester.id]);
        const capacity = gpmWhiteQuota(Number(coordinators.count), Number(currentRules.coordinator_team_multiplier));
        const usage = await one<{ total: string | number }>(db, `SELECT COALESCE(sum(amount),0) AS total
          FROM app.quota_reservations WHERE owner_employee_id=$1 AND spark_type='White' AND period_start=$2
            AND status IN ('Reserved','Consumed')`, [reservation.owner_employee_id, reservation.period_start]);
        if (Number(usage.total) > capacity)
          throw conflict('QUOTA_EXHAUSTED', 'The current GPM White quota no longer permits this approval.');
      }
    }
    if (award.spark_type === 'White' && (await activeQualityGate(db, award.recipient_employee_id)))
      throw conflict('QUALITY_GATE_ACTIVE', 'White credit is blocked by an active Quality Gate.');
    const ledger = await postLedgerOperation(db, {
      operationType: 'Award',
      actorUserId: principal.userId,
      subjectEmployeeId: award.recipient_employee_id,
      ruleSetVersionId: award.rule_set_version_id,
      sourceType: 'Award',
      sourceId: awardId,
      requestId,
      description: award.description,
      entries: [
        {
          employeeId: award.recipient_employee_id,
          sparkType: award.spark_type,
          amount: Number(award.spark_amount),
          entryKind: 'Credit',
          categoryVersionId: award.category_version_id,
          sourceType: 'Award',
          sourceId: awardId,
          description: award.description,
        },
      ],
    });
    await db.query(
      `UPDATE app.award_requests SET status='Approved', decided_at=clock_timestamp(),
              decided_by_user_id=$2, operation_id=$3 WHERE id=$1`,
      [awardId, principal.userId, ledger.operationId],
    );
    await db.query(
      `UPDATE app.quota_reservations SET status='Consumed', resolved_at=clock_timestamp()
        WHERE subject_type='Award' AND subject_id=$1 AND status='Reserved'`,
      [awardId],
    );
    await db.query(
      `INSERT INTO app.achievements
        (employee_id, achievement_type, title, description, spark_type, spark_amount,
         category_version_id, operation_id, source_type, source_id, awarded_by_user_id)
       SELECT $2,'Award',COALESCE(v.name,$7),$3,$4,$5,$6,$8,'Award',$1,$9
         FROM (SELECT 1) seed LEFT JOIN app.spark_category_versions v ON v.id=$6`,
      [awardId, award.recipient_employee_id, award.description, award.spark_type, Number(award.spark_amount),
        award.category_version_id, `${award.spark_type} Award`, ledger.operationId, principal.userId],
    );
  }
  await db.query(
    `INSERT INTO app.approval_actions
      (subject_type, subject_id, action, actor_user_id, reason, previous_status, resulting_status, request_id)
     VALUES ('Award',$1,$2,$3,$4,'Pending',$2,$5)`,
    [awardId, decision, principal.userId, reason.trim() || null, requestId],
  );
};

export const listEligibleRecipients = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  purpose: 'recognition' | 'award',
) => {
  const all = await rows<EmployeeRow>(
    db,
    `SELECT e.id, e.department_id, e.display_name, role.code AS role
       FROM app.employees e JOIN app.users u ON u.id=e.user_id AND u.account_status='Approved'
       JOIN LATERAL (
         SELECT r.code FROM app.role_assignments ra JOIN app.roles r ON r.id=ra.role_id
          WHERE ra.user_id=u.id AND ra.starts_at<=clock_timestamp()
            AND (ra.ends_at IS NULL OR ra.ends_at>clock_timestamp()) LIMIT 1
       ) role ON true WHERE e.is_active ORDER BY e.display_name`,
  );
  const eligible: EmployeeRow[] = [];
  for (const employee of all) {
    if (purpose === 'recognition') {
      if (employee.id !== principal.employeeId && ['Employee', 'Coordinator', 'GPM'].includes(employee.role))
        eligible.push(employee);
    } else if (await canTargetAwardRecipient(db, principal, employee)) eligible.push(employee);
  }
  return eligible;
};

export const currentQuarter = () => quarterForDate(new Date());
