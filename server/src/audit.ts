import { randomUUID } from 'node:crypto';
import type { Queryable } from './sql.js';

export interface AuditInput {
  actorUserId?: string | null | undefined;
  action: string;
  objectType: string;
  objectId: string;
  reason?: string | null | undefined;
  before?: unknown;
  after?: unknown;
  requestId: string;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
}

export const writeAudit = async (db: Queryable, input: AuditInput) => {
  const result = await db.query<{ id: string | number }>(
    `INSERT INTO app.audit_events
      (actor_user_id, action, entity_type, entity_id, reason, before_state, after_state,
       request_id, ip_address, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)
     RETURNING id`,
    [
      input.actorUserId ?? null,
      input.action,
      input.objectType,
      input.objectId,
      input.reason ?? null,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
      input.requestId,
      input.ip ?? null,
      input.userAgent ?? null,
    ],
  );
  return result.rows[0]!.id;
};

export const enqueueOutbox = async (
  db: Queryable,
  topic: string,
  aggregateType: string,
  aggregateId: string,
  payload: unknown,
) => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO app.outbox_events (id, event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [id, topic, aggregateType, aggregateId, JSON.stringify(payload)],
  );
  return id;
};

export const createNotification = async (
  db: Queryable,
  userId: string,
  type: string,
  title: string,
  text: string,
  objectType?: string,
  objectId?: string,
) => {
  const id = randomUUID();
  await db.query(
    `INSERT INTO app.notifications
      (id, recipient_user_id, notification_type, title, body, object_type, object_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, type, title, text, objectType ?? null, objectId ?? null],
  );
  return id;
};
