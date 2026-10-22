import { randomUUID } from 'node:crypto';
import type { PoolClient, Pool } from 'pg';
import { createNotification, enqueueOutbox, writeAudit } from './audit.js';
import type { AuthenticatedPrincipal } from './domain.js';
import { badRequest, conflict } from './errors.js';
import { maybeOne, one, rows } from './sql.js';

type Db = Pool | PoolClient;

export type FulfillmentKind = 'Virtual' | 'Physical' | 'Certificate' | 'ITEquipment';
export type DeliveryMethod = 'OfficePickup' | 'EmployeePaidDelivery' | 'WorkEmail' | 'InternalCoordination';

export interface FulfillmentChoice {
  deliveryMethod: DeliveryMethod;
  officeName?: string | undefined;
}

export interface RequestTrace {
  requestId: string;
  ip?: string | undefined;
  userAgent?: string | undefined;
}

const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const iso = (value: Date | string | null) => value ? new Date(value).toISOString() : null;
const dateOnly = (value: Date | string) => value instanceof Date
  ? value.toISOString().slice(0, 10)
  : (/^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1] ?? new Date(value).toISOString().slice(0, 10));

export const listFulfillmentContacts = async (db: Db) => (await rows<any>(db, `
  SELECT id,display_name,email::text,contact_role,office_name
    FROM app.reward_fulfillment_contacts
   WHERE is_active
   ORDER BY sort_order,display_name`)).map((contact) => ({
  id: contact.id,
  name: contact.display_name,
  email: contact.email,
  role: contact.contact_role,
  officeName: contact.office_name,
}));

const contact = (db: Db, id: string) => one<any>(db, `
  SELECT id,display_name,email::text,contact_role,office_name
    FROM app.reward_fulfillment_contacts
   WHERE id=$1 AND is_active`, [id]).catch(() => {
  throw badRequest('FULFILLMENT_CONTACT_INVALID', 'Choose an active reward fulfillment contact.');
});

const fulfillmentRecipient = (db: Db, employeeId: string) => one<{
  name: string;
  email: string | null;
  language: 'en' | 'uk' | 'ru';
}>(db, `
  SELECT employee.display_name AS name,
         COALESCE(account_user.email::text,employee.contact_email::text) AS email,
         CASE WHEN preferences.language IN ('uk','ru') THEN preferences.language ELSE 'en' END AS language
    FROM app.employees employee
    LEFT JOIN app.users account_user ON account_user.id=employee.user_id
    LEFT JOIN app.user_preferences preferences ON preferences.user_id=account_user.id
   WHERE employee.id=$1`, [employeeId]);

const notifyByEmails = async (
  db: PoolClient,
  emails: string[],
  title: string,
  body: string,
  fulfillmentId: string,
) => {
  const recipients = await rows<{ id: string }>(db, `
    SELECT id FROM app.users WHERE account_status='Approved' AND lower(email::text)=ANY($1::text[])`,
  [[...new Set(emails.map((email) => email.toLowerCase()))]]);
  for (const recipient of recipients)
    await createNotification(db, recipient.id, 'System', title, body, 'RewardFulfillment', fulfillmentId);
};

const fulfillmentRecipients = async (
  db: PoolClient,
  selectedEmail: string,
  recipientEmployeeId: string,
  includeManagement: boolean,
) => {
  const mainOffice = await maybeOne<{ email: string }>(db, `
    SELECT email::text FROM app.reward_fulfillment_contacts
     WHERE contact_role='OfficeManager' AND lower(office_name)='main office' AND is_active
     ORDER BY sort_order LIMIT 1`);
  const emails = [selectedEmail, ...(mainOffice ? [mainOffice.email] : [])];
  if (includeManagement) {
    const management = await rows<{ email: string }>(db, `
      SELECT DISTINCT account_user.email::text AS email
        FROM app.employees recipient
        LEFT JOIN app.employees manager ON manager.id=recipient.manager_employee_id
        LEFT JOIN app.users manager_user ON manager_user.id=manager.user_id
        LEFT JOIN app.departments department ON department.id=recipient.department_id
        LEFT JOIN app.employees head ON head.id=department.head_employee_id
        LEFT JOIN app.users head_user ON head_user.id=head.user_id
        CROSS JOIN LATERAL unnest(ARRAY[manager_user.email::text,head_user.email::text]) AS account_user(email)
       WHERE recipient.id=$1 AND account_user.email IS NOT NULL`, [recipientEmployeeId]);
    emails.push(...management.map((item) => item.email));
  }
  return [...new Set(emails.map((email) => email.toLowerCase()))];
};

export const createRadiantFulfillment = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  awardId: string,
  recipientEmployeeId: string,
  input: { contactId: string; rewardKind: 'RadiantAcrylic' | 'RadiantVesselModel'; valuablePrizeDescription: string },
) => {
  const assigned = await contact(db, input.contactId);
  const recipient = await fulfillmentRecipient(db, recipientEmployeeId);
  const id = randomUUID();
  await db.query(`INSERT INTO app.reward_fulfillments
    (id,source_type,award_request_id,recipient_employee_id,assigned_contact_id,reward_kind,
     delivery_method,valuable_prize_description,requested_by_user_id)
    VALUES ($1,'RadiantAward',$2,$3,$4,$5,'InternalCoordination',$6,$7)`, [
    id, awardId, recipientEmployeeId, assigned.id, input.rewardKind,
    input.valuablePrizeDescription.trim(), principal.userId,
  ]);
  const emails = await fulfillmentRecipients(db, assigned.email, recipientEmployeeId, false);
  await notifyByEmails(db, emails, 'Radiant reward fulfillment requested',
    'A Radiant physical award and valuable prize require coordination.', id);
  await enqueueOutbox(db, 'RewardFulfillmentRequested', 'RewardFulfillment', id, {
    sourceType: 'RadiantAward', awardId, recipientEmployeeId, rewardKind: input.rewardKind,
    recipientName: recipient.name, recipientEmail: recipient.email,
    language: recipient.language,
    valuablePrizeDescription: input.valuablePrizeDescription.trim(), assignedTo: assigned,
    emailTo: emails,
  });
  return { id, assignedTo: assigned, status: 'Requested' as const };
};

export const createShopFulfillment = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  purchaseId: string,
  productName: string,
  kind: FulfillmentKind,
  configuredContactId: string | null,
  choice?: FulfillmentChoice,
) => {
  if (kind === 'Virtual') return null;
  if (!choice) throw badRequest('FULFILLMENT_REQUIRED', 'Choose how this reward will be fulfilled.');
  if (!configuredContactId)
    throw badRequest('FULFILLMENT_CONTACT_REQUIRED', 'This product has no responsible fulfillment contact.');
  const assigned = await contact(db, configuredContactId);
  const recipient = await fulfillmentRecipient(db, principal.employeeId);
  const allowed: Record<Exclude<FulfillmentKind, 'Virtual'>, DeliveryMethod[]> = {
    Physical: ['OfficePickup', 'EmployeePaidDelivery'],
    Certificate: ['WorkEmail'],
    ITEquipment: ['InternalCoordination'],
  };
  if (!allowed[kind].includes(choice.deliveryMethod))
    throw badRequest('FULFILLMENT_METHOD_INVALID', 'The selected delivery method is not valid for this reward.');
  const officeName = choice.deliveryMethod === 'OfficePickup'
    ? (choice.officeName?.trim() || assigned.office_name)
    : null;
  if (choice.deliveryMethod === 'OfficePickup' && !officeName)
    throw badRequest('OFFICE_REQUIRED', 'Choose an office for pickup.');
  const rewardKinds = {
    Physical: 'ShopPhysical', Certificate: 'ShopCertificate', ITEquipment: 'ShopEquipment',
  } as const;
  const id = randomUUID();
  await db.query(`INSERT INTO app.reward_fulfillments
    (id,source_type,purchase_id,recipient_employee_id,assigned_contact_id,reward_kind,
     delivery_method,office_name,requested_by_user_id,notes)
    VALUES ($1,'ShopPurchase',$2,$3,$4,$5,$6,$7,$8,$9)`, [
    id, purchaseId, principal.employeeId, assigned.id, rewardKinds[kind], choice.deliveryMethod,
    officeName, principal.userId, `Purchased reward: ${productName}`,
  ]);
  const emails = await fulfillmentRecipients(db, assigned.email, principal.employeeId, kind === 'ITEquipment');
  const body = kind === 'Certificate'
    ? `${productName} must be ordered for the employee's work email.`
    : kind === 'ITEquipment'
      ? `${productName} requires one coordinated request to the IT department and accounting.`
      : `${productName} requires ordering and ${choice.deliveryMethod === 'OfficePickup' ? `office pickup at ${officeName}` : 'employee-paid delivery'}.`;
  await notifyByEmails(db, emails, 'Shop reward fulfillment requested', body, id);
  await enqueueOutbox(db, 'RewardFulfillmentRequested', 'RewardFulfillment', id, {
    sourceType: 'ShopPurchase', purchaseId, recipientEmployeeId: principal.employeeId,
    recipientName: recipient.name, recipientEmail: recipient.email,
    language: recipient.language,
    productName, fulfillmentKind: kind, deliveryMethod: choice.deliveryMethod, officeName,
    assignedTo: assigned, emailTo: emails,
    ...(kind === 'ITEquipment' ? { emailInstruction: 'Send one email to the manager, IT department and accounting.' } : {}),
  });
  return { id, assignedTo: assigned, status: 'Requested' as const };
};

export const listRewardFulfillments = async (db: Db) => (await rows<any>(db, `
  SELECT fulfillment.id,fulfillment.source_type,fulfillment.award_request_id,fulfillment.purchase_id,
         fulfillment.recipient_employee_id,employee.display_name AS employee_name,
         contact.display_name AS contact_name,contact.email::text AS contact_email,
         fulfillment.reward_kind,fulfillment.delivery_method,fulfillment.office_name,
         fulfillment.valuable_prize_description,fulfillment.status,fulfillment.requested_at,
         fulfillment.updated_at,fulfillment.notes
    FROM app.reward_fulfillments fulfillment
    JOIN app.employees employee ON employee.id=fulfillment.recipient_employee_id
    JOIN app.reward_fulfillment_contacts contact ON contact.id=fulfillment.assigned_contact_id
   ORDER BY fulfillment.requested_at DESC`)).map((item) => ({
  id: item.id,
  sourceType: item.source_type,
  awardId: item.award_request_id,
  purchaseId: item.purchase_id,
  employeeId: item.recipient_employee_id,
  employeeName: item.employee_name,
  contactName: item.contact_name,
  contactEmail: item.contact_email,
  rewardKind: item.reward_kind,
  deliveryMethod: item.delivery_method,
  officeName: item.office_name,
  valuablePrizeDescription: item.valuable_prize_description,
  status: item.status,
  requestedAt: iso(item.requested_at),
  updatedAt: iso(item.updated_at),
  notes: item.notes,
}));

export const createMonthlyDisenchantReport = async (
  db: PoolClient,
  principal: AuthenticatedPrincipal,
  requestedMonth: string,
  trace: RequestTrace,
) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth))
    throw badRequest('REPORT_MONTH_INVALID', 'Choose a valid report month.');
  const [year, month] = requestedMonth.split('-').map(Number) as [number, number];
  const rangeStartedAt = new Date(Date.UTC(year, month - 1, 1));
  const nextMonthStartedAt = new Date(Date.UTC(year, month, 1));
  const now = new Date();
  if (rangeStartedAt.getTime() > now.getTime())
    throw badRequest('REPORT_MONTH_IN_FUTURE', 'A Disenchant report cannot be created for a future month.');
  const rangeEndedAt = now.getTime() < nextMonthStartedAt.getTime() ? now : nextMonthStartedAt;
  const reportMonth = `${requestedMonth}-01`;
  await one(db, `SELECT id FROM app.departments WHERE id=$1 FOR UPDATE`, [principal.departmentId]);
  let report = await maybeOne<any>(db, `
    SELECT * FROM app.disenchant_reports WHERE department_id=$1 AND report_month=$2::date FOR UPDATE`,
  [principal.departmentId, reportMonth]);
  const reportCreated = !report;
  const selected = await rows<any>(db, `
    SELECT request.*,employee.display_name AS employee_name,employee.user_id
      FROM app.disenchant_requests request
      JOIN app.employees employee ON employee.id=request.employee_id
     WHERE request.department_id=$1 AND request.status<>'Cancelled'
       AND request.created_at >= $2::timestamptz AND request.created_at < $3::timestamptz
     ORDER BY request.created_at,request.id
     FOR UPDATE OF request`, [principal.departmentId, rangeStartedAt.toISOString(), rangeEndedAt.toISOString()]);
  if (!selected.length) throw conflict('NO_REPORTABLE_REQUESTS', 'There are no Disenchant requests for the selected month.');
  report = report
    ? await one<any>(db, `UPDATE app.disenchant_reports SET range_ended_at=$2::timestamptz
        WHERE id=$1 RETURNING *`, [report.id, rangeEndedAt.toISOString()])
    : await one<any>(db, `INSERT INTO app.disenchant_reports
        (department_id,report_month,range_started_at,range_ended_at,created_by_user_id)
        VALUES ($1,$2::date,$3::timestamptz,$4::timestamptz,$5) RETURNING *`, [
        principal.departmentId, reportMonth, rangeStartedAt.toISOString(), rangeEndedAt.toISOString(), principal.userId,
      ]);
  for (const item of selected) {
    await db.query(`INSERT INTO app.disenchant_report_items
      (report_id,disenchant_request_id,employee_name_snapshot,spark_type,spark_amount,money_amount,currency)
      VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (disenchant_request_id) DO NOTHING`, [
      report.id, item.id, item.employee_name, item.spark_type, item.spark_amount, item.money_amount, item.currency,
    ]);
    if (item.status !== 'Created') continue;
    await db.query(`UPDATE app.disenchant_requests SET status='Exported',exported_at=clock_timestamp(),
      export_reference=$2,status_changed_by_user_id=$3 WHERE id=$1`, [item.id, `monthly-report:${report.id}`, principal.userId]);
    if (item.user_id) await createNotification(db, item.user_id, 'DisenchantStatusChanged',
      'Disenchant included in monthly report', 'Your Disenchant request was included in the department monthly report.',
      'Disenchant', item.id);
    await writeAudit(db, { actorUserId: principal.userId, action: 'DISENCHANT_INCLUDED_IN_MONTHLY_REPORT',
      objectType: 'DisenchantRequest', objectId: item.id, before: { status: 'Created' },
      after: { status: 'Exported', reportId: report.id }, requestId: trace.requestId,
      ip: trace.ip, userAgent: trace.userAgent });
  }
  const grouped = new Map<string, { employeeName: string; sparkType: string; sparkAmount: number;
    moneyAmount: number; currency: string }>();
  for (const item of selected) {
    const key = `${item.employee_id}:${item.spark_type}:${item.currency}`;
    const line = grouped.get(key) ?? { employeeName: item.employee_name, sparkType: item.spark_type,
      sparkAmount: 0, moneyAmount: 0, currency: item.currency };
    line.sparkAmount += Number(item.spark_amount);
    line.moneyAmount += Number(item.money_amount);
    grouped.set(key, line);
  }
  const lines = [...grouped.values()].sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName) || left.sparkType.localeCompare(right.sparkType));
  const csvRows = [
    ['Employee', 'Spark type', 'Spark amount', 'Money equivalent', 'Currency'],
    ...lines.map((line) => [line.employeeName, line.sparkType, line.sparkAmount, line.moneyAmount.toFixed(2), line.currency]),
  ];
  const result = {
    id: report.id,
    reportMonth: requestedMonth,
    rangeStartedAt: iso(report.range_started_at),
    rangeEndedAt: iso(report.range_ended_at),
    status: 'Created' as const,
    itemCount: selected.length,
    moneyTotal: lines.reduce((sum, line) => sum + line.moneyAmount, 0),
    createdAt: iso(report.created_at),
    lines,
    fileName: `disenchant-${requestedMonth}-${principal.departmentId}.csv`,
    csv: `\uFEFF${csvRows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
  };
  await enqueueOutbox(db, 'DisenchantMonthlyReportExported', 'DisenchantReport', report.id, result);
  await writeAudit(db, { actorUserId: principal.userId, action: 'DISENCHANT_MONTHLY_REPORT_EXPORTED',
    objectType: 'DisenchantReport', objectId: report.id,
    after: { reportMonth, itemCount: selected.length, reportCreated },
    requestId: trace.requestId, ip: trace.ip, userAgent: trace.userAgent });
  return result;
};

export const listDepartmentDisenchantReports = async (db: Db, departmentId: string) =>
  (await rows<any>(db, `SELECT report.*,count(item.disenchant_request_id)::int AS item_count,
    COALESCE(sum(item.money_amount),0)::numeric(18,2) AS money_total
    FROM app.disenchant_reports report
    LEFT JOIN app.disenchant_report_items item ON item.report_id=report.id
    WHERE report.department_id=$1 GROUP BY report.id ORDER BY report.report_month DESC`, [departmentId]))
    .map((report) => ({
      id: report.id,
      reportMonth: dateOnly(report.report_month).slice(0, 7),
      rangeStartedAt: iso(report.range_started_at),
      rangeEndedAt: iso(report.range_ended_at),
      status: report.status,
      itemCount: Number(report.item_count),
      moneyTotal: Number(report.money_total),
      createdAt: iso(report.created_at),
    }));
