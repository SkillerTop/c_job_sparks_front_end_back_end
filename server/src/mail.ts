import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Environment } from './config/env.js';
import { withTransaction } from './db/transaction.js';
import { rows } from './sql.js';

type MailEnvironment = Pick<Environment,
  | 'MAIL_ENABLED'
  | 'MAIL_SENDER_EMAIL'
  | 'MAIL_SENDER_USER_ID'
  | 'MAIL_SENDER_NAME'
  | 'MAIL_WORKER_INTERVAL_MS'
  | 'MAIL_MAX_ATTEMPTS'
  | 'MAIL_BATCH_SIZE'
  | 'MICROSOFT_TENANT_ID'
  | 'MICROSOFT_CLIENT_ID'
  | 'MICROSOFT_CLIENT_SECRET'
  | 'FRONTEND_ORIGIN'
>;

interface MailLogger {
  info: (bindings: Record<string, unknown>, message: string) => void;
  warn: (bindings: Record<string, unknown>, message: string) => void;
  error: (bindings: Record<string, unknown>, message: string) => void;
}

interface OutboxMailEvent {
  id: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  attempts: string | number;
}

interface GraphTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export interface OutgoingMail {
  recipients: string[];
  subject: string;
  text: string;
  html: string;
}

export interface GraphMailConfiguration {
  MICROSOFT_TENANT_ID: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MAIL_SENDER_EMAIL: string;
  MAIL_SENDER_USER_ID: string;
  MAIL_SENDER_NAME: string;
}

export interface MailWorkerStatus {
  enabled: boolean;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
}

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const asString = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const asObject = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;
const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const recipientsFrom = (value: unknown) => Array.isArray(value)
  ? [...new Set(value
    .map(asString)
    .filter((email): email is string => Boolean(email && validEmail.test(email)))
    .map((email) => email.toLowerCase()))]
  : [];

type MailLanguage = 'en' | 'uk' | 'ru';

const mailCopy = {
  en: {
    subjectRadiant: (name: string) => `C-Job Sparks: Radiant reward for ${name}`,
    subjectPurchase: (reward: string, name: string) => `C-Job Sparks: ${reward} purchased by ${name}`,
    employee: 'Employee', reward: 'Reward', fulfillmentType: 'Fulfillment type', responsible: 'Responsible person',
    delivery: 'Delivery', pickupOffice: 'Pickup office', valuablePrize: 'Valuable prize',
    requiresFulfillment: 'A C-Job Sparks reward requires fulfillment.',
    requested: 'Reward fulfillment requested',
    requiresProcessing: 'A purchased or awarded reward requires processing.',
    open: 'Open C-Job Sparks',
    kinds: { Physical: 'Physical shop reward', Certificate: 'Certificate', ITEquipment: 'IT equipment or peripheral',
      RadiantAcrylic: 'Radiant acrylic award', RadiantVesselModel: 'Radiant 3D vessel model', Reward: 'Reward' },
  },
  uk: {
    subjectRadiant: (name: string) => `C-Job Sparks: нагорода Radiant для ${name}`,
    subjectPurchase: (reward: string, name: string) => `C-Job Sparks: придбано нагороду «${reward}» для ${name}`,
    employee: 'Працівник', reward: 'Нагорода', fulfillmentType: 'Тип видачі', responsible: 'Відповідальний',
    delivery: 'Спосіб отримання', pickupOffice: 'Офіс отримання', valuablePrize: 'Цінний приз',
    requiresFulfillment: 'Нагороду C-Job Sparks потрібно підготувати до видачі.',
    requested: 'Запит на підготовку нагороди',
    requiresProcessing: 'Придбану або нараховану нагороду потрібно опрацювати.',
    open: 'Відкрити C-Job Sparks',
    kinds: { Physical: 'Фізична нагорода з магазину', Certificate: 'Сертифікат', ITEquipment: 'ІТ-обладнання або периферія',
      RadiantAcrylic: 'Акрилова нагорода Radiant', RadiantVesselModel: '3D-модель судна Radiant', Reward: 'Нагорода' },
  },
  ru: {
    subjectRadiant: (name: string) => `C-Job Sparks: награда Radiant для ${name}`,
    subjectPurchase: (reward: string, name: string) => `C-Job Sparks: приобретена награда «${reward}» для ${name}`,
    employee: 'Сотрудник', reward: 'Награда', fulfillmentType: 'Тип выдачи', responsible: 'Ответственный',
    delivery: 'Способ получения', pickupOffice: 'Офис получения', valuablePrize: 'Ценный приз',
    requiresFulfillment: 'Награду C-Job Sparks необходимо подготовить к выдаче.',
    requested: 'Запрос на подготовку награды',
    requiresProcessing: 'Приобретённую или начисленную награду необходимо обработать.',
    open: 'Открыть C-Job Sparks',
    kinds: { Physical: 'Физическая награда из магазина', Certificate: 'Сертификат', ITEquipment: 'ИТ-оборудование или периферия',
      RadiantAcrylic: 'Акриловая награда Radiant', RadiantVesselModel: '3D-модель судна Radiant', Reward: 'Награда' },
  },
} as const;

const fulfillmentLabel = (value: string | null, language: MailLanguage) => {
  const kinds = mailCopy[language].kinds as Record<string, string>;
  return kinds[value ?? ''] ?? value ?? kinds.Reward ?? 'Reward';
};

export const rewardFulfillmentMail = (
  payload: Record<string, unknown>,
  frontendOrigin: string,
): OutgoingMail => {
  const recipients = recipientsFrom(payload.emailTo);
  if (recipients.length === 0) throw new Error('Reward fulfillment event has no valid email recipients.');
  const assigned = asObject(payload.assignedTo);
  const assignedName = asString(assigned?.name) ?? asString(assigned?.display_name) ?? asString(assigned?.email);
  const productName = asString(payload.productName);
  const rewardKind = asString(payload.rewardKind) ?? asString(payload.fulfillmentKind);
  const recipientName = asString(payload.recipientName) ?? 'Employee';
  const recipientEmail = asString(payload.recipientEmail);
  const deliveryMethod = asString(payload.deliveryMethod);
  const officeName = asString(payload.officeName);
  const valuablePrize = asString(payload.valuablePrizeDescription);
  const languageValue = asString(payload.language);
  const language: MailLanguage = languageValue === 'uk' || languageValue === 'ru' ? languageValue : 'en';
  const copy = mailCopy[language];
  const isRadiant = asString(payload.sourceType) === 'RadiantAward';
  const rewardName = productName ?? fulfillmentLabel(rewardKind, language);
  const subject = isRadiant
    ? copy.subjectRadiant(recipientName)
    : copy.subjectPurchase(rewardName, recipientName);
  const facts = [
    [copy.employee, recipientEmail ? `${recipientName} <${recipientEmail}>` : recipientName],
    [copy.reward, rewardName],
    [copy.fulfillmentType, fulfillmentLabel(rewardKind, language)],
    [copy.responsible, assignedName],
    [copy.delivery, deliveryMethod],
    [copy.pickupOffice, officeName],
    [copy.valuablePrize, valuablePrize],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const text = [
    copy.requiresFulfillment,
    '',
    ...facts.map(([label, value]) => `${label}: ${value}`),
    '',
    `${copy.open}: ${frontendOrigin}`,
  ].join('\n');
  const rowsHtml = facts.map(([label, value]) => `<tr>
    <td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #dbe4ee">${escapeHtml(label)}</td>
    <td style="padding:8px 12px;color:#102a43;font-weight:600;border-bottom:1px solid #dbe4ee">${escapeHtml(value)}</td>
  </tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f6f9;font-family:Arial,sans-serif;color:#102a43">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px">
      <div style="background:#102a43;color:#fff;padding:22px 24px;border-radius:14px 14px 0 0">
        <div style="font-size:12px;letter-spacing:1.5px;color:#c9a04a;font-weight:700">C-JOB SPARKS</div>
        <h1 style="font-size:24px;margin:8px 0 0">${escapeHtml(copy.requested)}</h1>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 14px 14px">
        <p style="margin:0 0 18px;line-height:1.5">${escapeHtml(copy.requiresProcessing)}</p>
        <table role="presentation" style="width:100%;border-collapse:collapse">${rowsHtml}</table>
        <p style="margin:24px 0 0"><a href="${escapeHtml(frontendOrigin)}" style="display:inline-block;background:#c9963f;color:#102a43;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">${escapeHtml(copy.open)}</a></p>
      </div>
    </div>
  </body></html>`;
  return { recipients, subject, text, html };
};

class GraphMailClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly configuration: GraphMailConfiguration,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async token() {
    if (this.accessToken && this.accessTokenExpiresAt > Date.now() + 60_000) return this.accessToken;
    const body = new URLSearchParams({
      client_id: this.configuration.MICROSOFT_CLIENT_ID,
      client_secret: this.configuration.MICROSOFT_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const response = await this.fetcher(
      `https://login.microsoftonline.com/${encodeURIComponent(this.configuration.MICROSOFT_TENANT_ID)}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
        signal: AbortSignal.timeout(15_000) },
    );
    const result = await response.json().catch(() => ({})) as GraphTokenResponse;
    if (!response.ok || typeof result.access_token !== 'string') {
      const description = asString(result.error_description) ?? asString(result.error) ?? 'Unknown token error.';
      throw new Error(`Microsoft token request failed (${response.status}): ${description}`);
    }
    const expiresIn = typeof result.expires_in === 'number' ? result.expires_in : Number(result.expires_in ?? 3600);
    this.accessToken = result.access_token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, expiresIn) * 1_000;
    return this.accessToken;
  }

  async send(message: OutgoingMail) {
    const token = await this.token();
    const response = await this.fetcher(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.configuration.MAIL_SENDER_USER_ID)}/sendMail`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: { contentType: 'HTML', content: message.html },
            toRecipients: message.recipients.map((address) => ({ emailAddress: { address } })),
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      if (response.status === 401) {
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
      }
      const detail = (await response.text().catch(() => '')).slice(0, 600);
      throw new Error(`Microsoft Graph sendMail failed (${response.status})${detail ? `: ${detail}` : '.'}`);
    }
  }
}

export const createGraphMailClient = (
  configuration: GraphMailConfiguration,
  fetcher: typeof fetch = fetch,
) => new GraphMailClient(configuration, fetcher);

export class GraphMailWorker {
  private readonly workerId = `graph-mail-${randomUUID()}`;
  private readonly client: GraphMailClient | null;
  private timer: NodeJS.Timeout | null = null;
  private activeRun: Promise<void> | null = null;
  private stopped = true;
  private lastRunAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly pool: Pool,
    private readonly environment: MailEnvironment,
    private readonly logger: MailLogger,
    fetcher: typeof fetch = fetch,
  ) {
    this.client = environment.MAIL_ENABLED
      ? createGraphMailClient({
          MICROSOFT_TENANT_ID: environment.MICROSOFT_TENANT_ID!,
          MICROSOFT_CLIENT_ID: environment.MICROSOFT_CLIENT_ID!,
          MICROSOFT_CLIENT_SECRET: environment.MICROSOFT_CLIENT_SECRET!,
          MAIL_SENDER_EMAIL: environment.MAIL_SENDER_EMAIL!,
          MAIL_SENDER_USER_ID: environment.MAIL_SENDER_USER_ID ?? environment.MAIL_SENDER_EMAIL!,
          MAIL_SENDER_NAME: environment.MAIL_SENDER_NAME,
        }, fetcher)
      : null;
  }

  status(): MailWorkerStatus {
    return {
      enabled: this.environment.MAIL_ENABLED,
      running: !this.stopped,
      lastRunAt: this.lastRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
    };
  }

  start() {
    if (!this.environment.MAIL_ENABLED || !this.stopped) return;
    this.stopped = false;
    this.logger.info({ workerId: this.workerId, sender: this.environment.MAIL_SENDER_EMAIL }, 'Graph mail worker started');
    this.schedule(0);
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.activeRun;
  }

  async runOnce() {
    if (!this.client) return 0;
    this.lastRunAt = new Date().toISOString();
    const events = await withTransaction(this.pool, (db) => rows<OutboxMailEvent>(db, `
      WITH candidates AS (
        SELECT id
          FROM app.outbox_events
         WHERE published_at IS NULL
           AND failed_at IS NULL
           AND event_type='RewardFulfillmentRequested'
           AND payload ? 'emailTo'
           AND available_at <= clock_timestamp()
           AND (locked_at IS NULL OR locked_at < clock_timestamp() - interval '10 minutes')
         ORDER BY occurred_at,id
         FOR UPDATE SKIP LOCKED
         LIMIT $2
      )
      UPDATE app.outbox_events event
         SET locked_at=clock_timestamp(),locked_by=$1
        FROM candidates
       WHERE event.id=candidates.id
      RETURNING event.id,event.aggregate_id,event.payload,event.attempts`,
    [this.workerId, this.environment.MAIL_BATCH_SIZE]));
    let deliveryFailed = false;
    for (const event of events) {
      if (!await this.deliver(event)) deliveryFailed = true;
    }
    if (!deliveryFailed) this.lastError = null;
    return events.length;
  }

  private async deliver(event: OutboxMailEvent) {
    try {
      const message = rewardFulfillmentMail(event.payload, this.environment.FRONTEND_ORIGIN);
      await this.client!.send(message);
      await this.pool.query(`UPDATE app.outbox_events
        SET published_at=clock_timestamp(),attempts=attempts+1,locked_at=NULL,locked_by=NULL,last_error=NULL
        WHERE id=$1 AND locked_by=$2`, [event.id, this.workerId]);
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = null;
      this.logger.info({ eventId: event.id, aggregateId: event.aggregate_id,
        recipientCount: message.recipients.length }, 'Reward fulfillment email sent');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempt = Number(event.attempts) + 1;
      const failed = nextAttempt >= this.environment.MAIL_MAX_ATTEMPTS;
      const delayMs = Math.min(3_600_000, this.environment.MAIL_WORKER_INTERVAL_MS * 2 ** Math.min(nextAttempt, 10));
      await this.pool.query(`UPDATE app.outbox_events
        SET attempts=attempts+1,last_error=$3,failed_at=CASE WHEN $4 THEN clock_timestamp() ELSE NULL END,
            available_at=CASE WHEN $4 THEN available_at ELSE clock_timestamp()+($5*interval '1 millisecond') END,
            locked_at=NULL,locked_by=NULL
        WHERE id=$1 AND locked_by=$2`, [event.id, this.workerId, message.slice(0, 1_000), failed, delayMs]);
      this.lastError = message.slice(0, 1_000);
      const bindings = {
        eventId: event.id,
        aggregateId: event.aggregate_id,
        attempt: nextAttempt,
        failed,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      };
      if (failed) this.logger.error(bindings, 'Reward fulfillment email permanently failed');
      else this.logger.warn(bindings, 'Reward fulfillment email delivery will be retried');
      return false;
    }
  }

  private schedule(delayMs: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.activeRun = this.runOnce()
        .then(() => undefined)
        .catch((error) => {
          this.lastError = error instanceof Error ? error.message : String(error);
          this.logger.error({ err: error, workerId: this.workerId }, 'Graph mail worker cycle failed');
        })
        .finally(() => {
          this.activeRun = null;
          this.schedule(this.environment.MAIL_WORKER_INTERVAL_MS);
        });
    }, delayMs);
    this.timer.unref();
  }
}
