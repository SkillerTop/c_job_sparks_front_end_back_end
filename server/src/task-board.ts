import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { createNotification, enqueueOutbox, writeAudit } from './audit.js';
import type { AuthenticatedPrincipal, Role, SpendableSparkType } from './domain.js';
import { ApiError, badRequest, conflict, forbidden, notFound } from './errors.js';
import { postLedgerOperation } from './ledger.js';
import { requestHash } from './security.js';
import { maybeOne, one, rows, type Queryable } from './sql.js';

export const TASK_BOARD_CREATOR_ROLES: readonly Role[] = ['Head', 'Top Management', 'Administrator'];
export const TASK_BOARD_FILTERS = ['all', 'active', 'booked', 'completed', 'mine', 'assigned'] as const;
export type TaskBoardFilter = typeof TASK_BOARD_FILTERS[number];
export type TaskBoardStatus = 'Active' | 'Booked' | 'Completed' | 'Cancelled';

export interface TaskBoardRewardComponent {
  sparkType: SpendableSparkType;
  amount: number;
}

export interface TaskBoardDraft {
  title: string;
  description: string;
  rewardComponents: TaskBoardRewardComponent[];
  dueDate: string | null;
}

export interface TaskBoardTrace {
  requestId: string;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

interface TaskRow {
  id: string;
  title: string;
  description: string;
  reward_spark_type: SpendableSparkType;
  reward_amount: number | string;
  reward_components: unknown;
  author_user_id: string;
  author_employee_id: string;
  author_name: string;
  author_department_id: string | null;
  author_department_name: string;
  status: TaskBoardStatus;
  assignee_user_id: string | null;
  assignee_employee_id: string | null;
  assignee_name: string | null;
  booked_at: Date | string | null;
  due_date: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  deleted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  row_version: number | string;
  reward_operation_id: string | null;
  sort_rank?: number | string;
}

interface ApprovalRow {
  id: string;
  actor_user_id: string;
  task_id: string | null;
  approval_kind: 'Create' | 'RewardChange';
  task_snapshot: TaskBoardDraft & { taskId: string | null };
  reward_amount: number | string;
  reward_components: unknown;
  first_confirmed_at: Date | string | null;
  second_confirmed_at: Date | string | null;
  consumed_at: Date | string | null;
  expires_at: Date | string;
}

const taskSelect = `
  SELECT task.*,author.display_name AS author_name,
         assignee.display_name AS assignee_name,
         CASE task.status WHEN 'Active' THEN 0 WHEN 'Booked' THEN 1
           WHEN 'Completed' THEN 2 ELSE 3 END AS sort_rank
    FROM app.task_board_tasks task
    JOIN app.employees author ON author.id=task.author_employee_id
    LEFT JOIN app.employees assignee ON assignee.id=task.assignee_employee_id`;

const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const dateOnly = (value: Date | string | null) => value ? String(value).slice(0, 10) : null;

const rewardOrder: SpendableSparkType[] = ['White', 'Yellow', 'Blue'];
const normalizeRewardComponents = (value: TaskBoardRewardComponent[]) => {
  const components = value
    .map((component) => ({ sparkType: component.sparkType, amount: component.amount }))
    .filter((component) => component.amount > 0)
    .sort((left, right) => rewardOrder.indexOf(left.sparkType) - rewardOrder.indexOf(right.sparkType));
  if (components.length < 1 || components.length > 3 ||
    new Set(components.map((component) => component.sparkType)).size !== components.length ||
    components.some((component) => !rewardOrder.includes(component.sparkType) ||
      !Number.isSafeInteger(component.amount) || component.amount > 1_000_000))
    throw badRequest('INVALID_TASK_REWARD', 'Choose one to three unique Spark types with positive whole-number amounts.');
  return components;
};

const rewardComponentsFrom = (task: Pick<TaskRow, 'reward_components' | 'reward_spark_type' | 'reward_amount'>) => {
  if (Array.isArray(task.reward_components))
    return normalizeRewardComponents(task.reward_components as TaskBoardRewardComponent[]);
  return [{ sparkType: task.reward_spark_type, amount: Number(task.reward_amount) }];
};

const rewardText = (components: TaskBoardRewardComponent[]) =>
  components.map((component) => `${component.amount} ${component.sparkType}`).join(' + ');

const normalizeDraft = (draft: TaskBoardDraft): TaskBoardDraft => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  rewardComponents: normalizeRewardComponents(draft.rewardComponents),
  dueDate: draft.dueDate || null,
});

const approvalSnapshot = (draft: TaskBoardDraft, taskId: string | null) => ({
  ...normalizeDraft(draft),
  taskId,
});

const requireCreator = (principal: AuthenticatedPrincipal) => {
  if (!TASK_BOARD_CREATOR_ROLES.includes(principal.role))
    throw forbidden('Only Top Management, Heads and Administrators can publish tasks.');
};

const canManageTask = (principal: AuthenticatedPrincipal, task: TaskRow) =>
  principal.role === 'Administrator' || principal.userId === task.author_user_id;

const publicTask = (task: TaskRow, principal: AuthenticatedPrincipal) => ({
  id: task.id,
  title: task.title,
  description: task.description,
  rewardComponents: rewardComponentsFrom(task),
  rewardSparkType: task.reward_spark_type,
  rewardAmount: Number(task.reward_amount),
  authorId: task.author_employee_id,
  authorName: task.author_name,
  authorDepartmentId: task.author_department_id,
  authorDepartmentName: task.author_department_name,
  dueDate: dateOnly(task.due_date),
  status: task.status,
  assigneeId: task.assignee_employee_id,
  assigneeName: task.assignee_name,
  bookedAt: iso(task.booked_at),
  completedAt: iso(task.completed_at),
  cancelledAt: iso(task.cancelled_at),
  createdAt: iso(task.created_at),
  updatedAt: iso(task.updated_at),
  rowVersion: Number(task.row_version),
  permissions: {
    canEdit: principal.role === 'Administrator' ||
      (principal.userId === task.author_user_id && !['Completed', 'Cancelled'].includes(task.status)),
    canCancel: principal.role === 'Administrator' ||
      (principal.userId === task.author_user_id && !['Completed', 'Cancelled'].includes(task.status)),
    canBook: task.status === 'Active' && principal.employeeId !== task.author_employee_id,
    canUnassign: task.status === 'Booked' && canManageTask(principal, task),
    canComplete: task.status === 'Booked' && canManageTask(principal, task),
    canViewHistory: principal.role === 'Administrator',
  },
});

const taskState = (task: TaskRow) => ({
  title: task.title,
  description: task.description,
  rewardComponents: rewardComponentsFrom(task),
  dueDate: dateOnly(task.due_date),
  status: task.status,
  assigneeEmployeeId: task.assignee_employee_id,
  bookedAt: iso(task.booked_at),
  completedAt: iso(task.completed_at),
  cancelledAt: iso(task.cancelled_at),
  rowVersion: Number(task.row_version),
});

const appendEvent = async (
  db: Queryable,
  taskId: string,
  actorUserId: string | null,
  eventType: string,
  before?: unknown,
  after?: unknown,
  metadata: Record<string, unknown> = {},
  occurredAt?: Date | string | null,
) => db.query(`INSERT INTO app.task_board_events
  (task_id,actor_user_id,event_type,before_state,after_state,metadata,occurred_at)
  VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,COALESCE($7::timestamptz,clock_timestamp()))`, [
  taskId,
  actorUserId,
  eventType,
  before === undefined ? null : JSON.stringify(before),
  after === undefined ? null : JSON.stringify(after),
  JSON.stringify(metadata),
  occurredAt ?? null,
]);

const loadTask = async (db: Queryable, id: string, forUpdate = false) => {
  const task = await maybeOne<TaskRow>(db, `${taskSelect} WHERE task.id=$1 ${forUpdate ? 'FOR UPDATE OF task' : ''}`, [id]);
  if (!task) throw notFound('Task board item');
  return task;
};

const loadApproval = async (
  db: Queryable,
  principal: AuthenticatedPrincipal,
  approvalSessionId: string,
  draft: TaskBoardDraft,
  taskId: string | null,
) => {
  const approval = await maybeOne<ApprovalRow>(db, `SELECT * FROM app.task_board_approval_sessions
    WHERE id=$1 FOR UPDATE`, [approvalSessionId]);
  if (!approval) throw badRequest('TASK_APPROVAL_REQUIRED', 'Complete both reward approval confirmations before publishing.');
  if (approval.actor_user_id !== principal.userId)
    throw forbidden('The approval confirmation belongs to another user.');
  if (approval.task_id !== taskId || requestHash(approval.task_snapshot) !== requestHash(approvalSnapshot(draft, taskId)))
    throw conflict('TASK_APPROVAL_CHANGED', 'The approved task text, deadline or reward has changed. Confirm the reward again.');
  if (!approval.first_confirmed_at || !approval.second_confirmed_at)
    throw badRequest('TASK_APPROVAL_REQUIRED', 'Complete both reward approval confirmations before publishing.');
  if (approval.consumed_at)
    throw conflict('TASK_APPROVAL_USED', 'This reward approval confirmation has already been used.');
  if (new Date(approval.expires_at).getTime() <= Date.now())
    throw conflict('TASK_APPROVAL_EXPIRED', 'The reward approval confirmation expired. Start again.');
  return approval;
};

const consumeApproval = async (db: Queryable, approval: ApprovalRow, taskId: string) => {
  await db.query(`UPDATE app.task_board_approval_sessions
    SET task_id=$2,consumed_at=clock_timestamp() WHERE id=$1 AND consumed_at IS NULL`, [approval.id, taskId]);
  const metadata = {
    approvalSessionId: approval.id,
    rewardComponents: approval.reward_components,
    snapshot: approval.task_snapshot,
  };
  await appendEvent(db, taskId, approval.actor_user_id, 'ApprovalFirstConfirmed', undefined, undefined,
    metadata, approval.first_confirmed_at);
  await appendEvent(db, taskId, approval.actor_user_id, 'ApprovalSecondConfirmed', undefined, undefined,
    metadata, approval.second_confirmed_at);
};

const parseCursor = (cursor?: string) => {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    const rank = Number(parsed.rank);
    const createdAt = String(parsed.createdAt ?? '');
    const id = String(parsed.id ?? '');
    if (!Number.isInteger(rank) || rank < 0 || rank > 3 || !Number.isFinite(Date.parse(createdAt)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
      throw new Error('invalid');
    return { rank, createdAt, id };
  } catch {
    throw badRequest('INVALID_CURSOR', 'The task board pagination cursor is invalid or expired.');
  }
};

export const listTaskBoardItems = async (
  db: Queryable,
  principal: AuthenticatedPrincipal,
  filter: TaskBoardFilter,
  limit: number,
  cursor?: string,
) => {
  const parsed = parseCursor(cursor);
  const rankExpression = `CASE task.status WHEN 'Active' THEN 0 WHEN 'Booked' THEN 1
    WHEN 'Completed' THEN 2 ELSE 3 END`;
  const values = await rows<TaskRow>(db, `${taskSelect}
    WHERE task.deleted_at IS NULL
      AND ($1='all'
        OR ($1='active' AND task.status='Active')
        OR ($1='booked' AND task.status='Booked')
        OR ($1='completed' AND task.status='Completed')
        OR ($1='mine' AND task.author_employee_id=$2)
        OR ($1='assigned' AND task.assignee_employee_id=$2))
      AND ($3::int IS NULL OR ${rankExpression}>$3::int
        OR (${rankExpression}=$3::int AND (task.created_at,task.id)<($4::timestamptz,$5::uuid)))
    ORDER BY sort_rank,task.created_at DESC,task.id DESC
    LIMIT $6`, [filter, principal.employeeId, parsed?.rank ?? null, parsed?.createdAt ?? null,
    parsed?.id ?? null, limit + 1]);
  const hasNext = values.length > limit;
  const page = values.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map((task) => publicTask(task, principal)),
    hasNext,
    nextCursor: hasNext && last ? Buffer.from(JSON.stringify({
      rank: Number(last.sort_rank), createdAt: iso(last.created_at), id: last.id,
    })).toString('base64url') : null,
  };
};

export const startTaskBoardApproval = async (
  db: Queryable,
  principal: AuthenticatedPrincipal,
  draft: TaskBoardDraft,
  taskId: string | null,
) => {
  const normalized = normalizeDraft(draft);
  if (taskId) {
    const task = await loadTask(db, taskId);
    if (!canManageTask(principal, task)) throw forbidden('Only the task author or an Administrator can edit this task.');
    if (task.status === 'Completed') throw conflict('TASK_REWARD_LOCKED', 'A completed task reward cannot be changed.');
  } else requireCreator(principal);
  const snapshot = approvalSnapshot(normalized, taskId);
  const primaryReward = normalized.rewardComponents[0]!;
  const id = randomUUID();
  const row = await one<{ expires_at: Date | string }>(db, `INSERT INTO app.task_board_approval_sessions
    (id,actor_user_id,task_id,approval_kind,task_snapshot,reward_amount,reward_components)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb) RETURNING expires_at`, [
    id, principal.userId, taskId, taskId ? 'RewardChange' : 'Create', JSON.stringify(snapshot), primaryReward.amount,
    JSON.stringify(normalized.rewardComponents),
  ]);
  return { id, stage: 'First' as const, expiresAt: iso(row.expires_at) };
};

export const confirmTaskBoardApprovalFirst = async (
  db: Queryable,
  principal: AuthenticatedPrincipal,
  id: string,
) => {
  const approval = await maybeOne<ApprovalRow>(db, `SELECT * FROM app.task_board_approval_sessions WHERE id=$1 FOR UPDATE`, [id]);
  if (!approval) throw notFound('Task reward approval');
  if (approval.actor_user_id !== principal.userId) throw forbidden();
  if (approval.consumed_at || new Date(approval.expires_at).getTime() <= Date.now())
    throw conflict('TASK_APPROVAL_EXPIRED', 'The reward approval confirmation expired. Start again.');
  await db.query(`UPDATE app.task_board_approval_sessions SET first_confirmed_at=COALESCE(first_confirmed_at,clock_timestamp())
    WHERE id=$1`, [id]);
  return { id, stage: 'Second' as const };
};

export const confirmTaskBoardApprovalSecond = async (
  db: Queryable,
  principal: AuthenticatedPrincipal,
  id: string,
) => {
  const approval = await maybeOne<ApprovalRow>(db, `SELECT * FROM app.task_board_approval_sessions WHERE id=$1 FOR UPDATE`, [id]);
  if (!approval) throw notFound('Task reward approval');
  if (approval.actor_user_id !== principal.userId) throw forbidden();
  if (!approval.first_confirmed_at)
    throw conflict('TASK_APPROVAL_ORDER', 'Confirm the first reward approval warning before the second.');
  if (approval.consumed_at || new Date(approval.expires_at).getTime() <= Date.now())
    throw conflict('TASK_APPROVAL_EXPIRED', 'The reward approval confirmation expired. Start again.');
  await db.query(`UPDATE app.task_board_approval_sessions SET second_confirmed_at=COALESCE(second_confirmed_at,clock_timestamp())
    WHERE id=$1`, [id]);
  return { id, stage: 'Ready' as const };
};

export const createTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  draft: TaskBoardDraft,
  approvalSessionId: string,
  trace: TaskBoardTrace,
) => {
  requireCreator(principal);
  const normalized = normalizeDraft(draft);
  const approval = await loadApproval(db, principal, approvalSessionId, normalized, null);
  const author = await maybeOne<{ department_id: string | null; department_name: string | null }>(db, `
    SELECT employee.department_id,department.name AS department_name
      FROM app.employees employee
      LEFT JOIN app.departments department ON department.id=employee.department_id
     WHERE employee.id=$1 AND employee.user_id=$2 AND employee.is_active`, [principal.employeeId, principal.userId]);
  if (!author) throw forbidden('Only active employees can publish tasks.');
  const primaryReward = normalized.rewardComponents[0]!;
  const id = randomUUID();
  const task = await one<TaskRow>(db, `INSERT INTO app.task_board_tasks
    (id,title,description,reward_spark_type,reward_amount,reward_components,author_user_id,author_employee_id,
     author_department_id,author_department_name,approval_session_id,due_date)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)
    RETURNING *,NULL::text AS author_name,NULL::text AS assignee_name,0 AS sort_rank`, [
    id, normalized.title, normalized.description, primaryReward.sparkType, primaryReward.amount,
    JSON.stringify(normalized.rewardComponents), principal.userId, principal.employeeId,
    author.department_id, author.department_name ?? 'Not assigned', approval.id, normalized.dueDate,
  ]);
  task.author_name = (await one<{ display_name: string }>(db,
    `SELECT display_name FROM app.employees WHERE id=$1`, [principal.employeeId])).display_name;
  await consumeApproval(db, approval, id);
  await appendEvent(db, id, principal.userId, 'Created', undefined, taskState(task));
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_CREATED', objectType: 'TaskBoardItem',
    objectId: id, after: taskState(task), requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  await enqueueOutbox(db, 'TaskBoardItemCreated', 'TaskBoardItem', id,
    { taskId: id, authorEmployeeId: principal.employeeId, rewardComponents: normalized.rewardComponents });
  return publicTask(task, principal);
};

export const updateTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  id: string,
  draft: TaskBoardDraft,
  approvalSessionId: string | null,
  trace: TaskBoardTrace,
) => {
  const task = await loadTask(db, id, true);
  if (!canManageTask(principal, task)) throw forbidden('Only the task author or an Administrator can edit this task.');
  if (task.status === 'Completed' && principal.role !== 'Administrator')
    throw conflict('TASK_NOT_EDITABLE', 'A completed task can only be managed by an Administrator.');
  if (task.status === 'Cancelled' && principal.role !== 'Administrator')
    throw conflict('TASK_NOT_EDITABLE', 'A cancelled task cannot be edited.');
  const normalized = normalizeDraft(draft);
  const rewardChanged = requestHash(normalized.rewardComponents) !== requestHash(rewardComponentsFrom(task));
  if (task.status === 'Completed' && rewardChanged)
    throw conflict('TASK_REWARD_LOCKED', 'A completed task reward cannot be changed.');
  let approval: ApprovalRow | null = null;
  if (rewardChanged) {
    if (!approvalSessionId)
      throw badRequest('TASK_APPROVAL_REQUIRED', 'Changing the reward requires both approval confirmations.');
    approval = await loadApproval(db, principal, approvalSessionId, normalized, id);
  }
  const before = taskState(task);
  const primaryReward = normalized.rewardComponents[0]!;
  await db.query(`UPDATE app.task_board_tasks
    SET title=$2,description=$3,reward_spark_type=$4,reward_amount=$5,reward_components=$6::jsonb,due_date=$7,
        updated_at=clock_timestamp(),row_version=row_version+1,approval_session_id=COALESCE($8,approval_session_id)
    WHERE id=$1`, [id, normalized.title, normalized.description, primaryReward.sparkType, primaryReward.amount,
    JSON.stringify(normalized.rewardComponents), normalized.dueDate, approval?.id ?? null]);
  if (approval) await consumeApproval(db, approval, id);
  const updated = await loadTask(db, id);
  await appendEvent(db, id, principal.userId, 'Updated', before, taskState(updated), { rewardChanged });
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_UPDATED', objectType: 'TaskBoardItem',
    objectId: id, before, after: taskState(updated), requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  return publicTask(updated, principal);
};

export const bookTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  id: string,
  trace: TaskBoardTrace,
) => {
  const task = await loadTask(db, id, true);
  const active = await maybeOne<{ active: boolean }>(db, `SELECT is_active AS active FROM app.employees
    WHERE id=$1 AND user_id=$2`, [principal.employeeId, principal.userId]);
  if (!active?.active) throw forbidden('Only active employees can book tasks.');
  if (task.author_employee_id === principal.employeeId)
    throw conflict('OWN_TASK_NOT_ALLOWED', 'You cannot book your own task.');
  if (task.status !== 'Active' || task.assignee_employee_id)
    throw conflict('TASK_ALREADY_BOOKED', 'This task is already booked by another employee.');
  const before = taskState(task);
  const result = await db.query(`UPDATE app.task_board_tasks SET status='Booked',assignee_user_id=$2,
    assignee_employee_id=$3,booked_at=clock_timestamp(),updated_at=clock_timestamp(),row_version=row_version+1
    WHERE id=$1 AND status='Active' AND assignee_employee_id IS NULL`, [id, principal.userId, principal.employeeId]);
  if (result.rowCount !== 1)
    throw conflict('TASK_ALREADY_BOOKED', 'This task is already booked by another employee.');
  const updated = await loadTask(db, id);
  await appendEvent(db, id, principal.userId, 'Booked', before, taskState(updated));
  await createNotification(db, task.author_user_id, 'TaskBooked', 'Task booked',
    `${updated.assignee_name ?? 'An employee'} booked the task “${task.title}”.`, 'TaskBoardItem', id, '/task-board');
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_BOOKED', objectType: 'TaskBoardItem',
    objectId: id, before, after: taskState(updated), requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  return publicTask(updated, principal);
};

export const unassignTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  id: string,
  reason: string | null,
  trace: TaskBoardTrace,
) => {
  const task = await loadTask(db, id, true);
  if (!canManageTask(principal, task)) throw forbidden('Only the task author or an Administrator can unassign the employee.');
  if (task.status !== 'Booked' || !task.assignee_employee_id || !task.assignee_user_id)
    throw conflict('TASK_NOT_BOOKED', 'This task does not have an assigned employee.');
  const before = taskState(task);
  const removed = { employeeId: task.assignee_employee_id, name: task.assignee_name, userId: task.assignee_user_id };
  await db.query(`UPDATE app.task_board_tasks SET status='Active',assignee_user_id=NULL,assignee_employee_id=NULL,
    booked_at=NULL,updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`, [id]);
  const updated = await loadTask(db, id);
  await appendEvent(db, id, principal.userId, 'AssigneeDetached', before, taskState(updated), { removed, reason });
  await createNotification(db, removed.userId, 'TaskUnassigned', 'You were unassigned from a task',
    `You were unassigned from the task “${task.title}”.`, 'TaskBoardItem', id, '/task-board');
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_ASSIGNEE_DETACHED',
    objectType: 'TaskBoardItem', objectId: id, reason, before, after: taskState(updated),
    requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  return publicTask(updated, principal);
};

export const completeTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  id: string,
  trace: TaskBoardTrace,
) => {
  const task = await loadTask(db, id, true);
  if (!canManageTask(principal, task)) throw forbidden('Only the task author or an Administrator can confirm completion.');
  if (task.status === 'Completed' || task.reward_operation_id)
    throw conflict('TASK_ALREADY_COMPLETED', 'This task has already been completed and rewarded.');
  if (task.status !== 'Booked' || !task.assignee_employee_id || !task.assignee_user_id)
    throw conflict('TASK_NOT_BOOKED', 'Assign an employee before confirming completion.');
  const assigneeEmployeeId = task.assignee_employee_id;
  const before = taskState(task);
  const rewardComponents = rewardComponentsFrom(task);
  const ledger = await postLedgerOperation(db, {
    operationType: 'Grant',
    actorUserId: principal.userId,
    subjectEmployeeId: assigneeEmployeeId,
    sourceType: 'TaskBoardItem',
    sourceId: task.id,
    requestId: trace.requestId,
    description: `Completed task board item: ${task.title}`,
    entries: rewardComponents.map((component) => ({
      employeeId: assigneeEmployeeId,
      sparkType: component.sparkType,
      amount: component.amount,
      entryKind: 'Credit',
      sourceType: 'TaskBoardItem',
      sourceId: task.id,
      description: `Task completed: ${task.title}`,
    })),
  });
  await db.query(`UPDATE app.task_board_tasks SET status='Completed',completed_at=clock_timestamp(),
    completed_by_user_id=$2,reward_operation_id=$3,updated_at=clock_timestamp(),row_version=row_version+1
    WHERE id=$1 AND status='Booked' AND reward_operation_id IS NULL`, [id, principal.userId, ledger.operationId]);
  const updated = await loadTask(db, id);
  await appendEvent(db, id, principal.userId, 'Completed', before, taskState(updated));
  await appendEvent(db, id, principal.userId, 'RewardCredited', undefined,
    { employeeId: assigneeEmployeeId, rewardComponents },
    { operationId: ledger.operationId });
  await createNotification(db, task.assignee_user_id, 'TaskCompleted', 'Task completed',
    `The task “${task.title}” was marked as completed. You received ${rewardText(rewardComponents)} Sparks.`,
    'TaskBoardItem', id, '/task-board');
  await enqueueOutbox(db, 'TaskBoardItemCompleted', 'TaskBoardItem', id, {
    taskId: id,
    employeeId: assigneeEmployeeId,
    rewardComponents,
    operationId: ledger.operationId,
  });
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_COMPLETED', objectType: 'TaskBoardItem',
    objectId: id, before, after: taskState(updated), requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  return publicTask(updated, principal);
};

export const cancelOrDeleteTaskBoardItem = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  id: string,
  trace: TaskBoardTrace,
) => {
  const task = await loadTask(db, id, true);
  if (!canManageTask(principal, task)) throw forbidden('Only the task author or an Administrator can remove this task.');
  if (task.status === 'Completed' || task.status === 'Cancelled') {
    if (principal.role !== 'Administrator') throw conflict('TASK_NOT_CANCELLABLE', 'This task can no longer be cancelled.');
    if (task.deleted_at) return { id, deleted: true };
    await db.query(`UPDATE app.task_board_tasks SET deleted_at=clock_timestamp(),deleted_by_user_id=$2,
      updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`, [id, principal.userId]);
    await appendEvent(db, id, principal.userId, 'Deleted', taskState(task), undefined,
      { rewardPreserved: task.status === 'Completed' });
    await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_DELETED', objectType: 'TaskBoardItem',
      objectId: id, before: taskState(task), after: { deleted: true, rewardPreserved: task.status === 'Completed' },
      requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
    return { id, deleted: true };
  }
  const before = taskState(task);
  const removedUserId = task.assignee_user_id;
  await db.query(`UPDATE app.task_board_tasks SET status='Cancelled',assignee_user_id=NULL,
    assignee_employee_id=NULL,booked_at=NULL,cancelled_at=clock_timestamp(),cancelled_by_user_id=$2,
    updated_at=clock_timestamp(),row_version=row_version+1 WHERE id=$1`, [id, principal.userId]);
  const updated = await loadTask(db, id);
  await appendEvent(db, id, principal.userId, 'Cancelled', before, taskState(updated));
  if (removedUserId) await createNotification(db, removedUserId, 'TaskUnassigned', 'Task cancelled',
    `The task “${task.title}” was cancelled.`, 'TaskBoardItem', id, '/task-board');
  await writeAudit(db, { actorUserId: principal.userId, action: 'TASK_BOARD_CANCELLED', objectType: 'TaskBoardItem',
    objectId: id, before, after: taskState(updated), requestId: trace.requestId, ip: trace.ip,
    userAgent: trace.userAgent });
  return publicTask(updated, principal);
};

export const taskBoardHistory = async (db: Queryable, principal: AuthenticatedPrincipal, id: string) => {
  if (principal.role !== 'Administrator') throw forbidden('Only Administrators can view task history.');
  await loadTask(db, id);
  return rows<any>(db, `SELECT event.id::text,event.event_type AS "eventType",event.before_state AS "beforeState",
    event.after_state AS "afterState",event.metadata,event.occurred_at::text AS "occurredAt",
    COALESCE(employee.display_name,'System') AS "actorName"
    FROM app.task_board_events event
    LEFT JOIN app.users account_user ON account_user.id=event.actor_user_id
    LEFT JOIN app.employees employee ON employee.user_id=account_user.id
    WHERE event.task_id=$1 ORDER BY event.occurred_at,event.id`, [id]);
};

export const notifyAdministratorsOfTaskRewardFailure = async (pool: Pool, taskId: string) => {
  try {
    const administrators = await rows<{ id: string }>(pool, `SELECT DISTINCT account_user.id
      FROM app.users account_user
      JOIN app.role_assignments assignment ON assignment.user_id=account_user.id
      JOIN app.roles role ON role.id=assignment.role_id AND role.code='Administrator'
      WHERE account_user.account_status='Approved' AND assignment.ends_at IS NULL`);
    for (const administrator of administrators)
      await createNotification(pool, administrator.id, 'TaskRewardFailed', 'Task reward could not be credited',
        `The reward for task ${taskId} could not be credited. Review the server logs using the request ID.`,
        'TaskBoardItem', taskId, '/task-board');
  } catch {
    // The original completion error remains authoritative; alerting must not mask it.
  }
};

export const shouldAlertTaskRewardFailure = (error: unknown) => !(error instanceof ApiError);
