# C-Job Sparks

C-Job Sparks is a full-stack employee recognition and rewards application. The existing React 19 interface can still run as a self-contained demo, or it can use the included Fastify/PostgreSQL backend as the authoritative source for identity, roles, organizational scope and the Spark economy.

## Stack

- React 19, TypeScript and Vite
- Node.js 24 and Fastify 5
- PostgreSQL 15+
- Argon2id passwords and opaque server-side sessions
- Optional Microsoft Entra ID authorization-code sign-in with PKCE
- pnpm workspace

## Production deployment

The repository includes a multi-stage `Dockerfile`, `compose.prod.yaml`, Nginx templates, persistent PostgreSQL/media volumes and a systemd unit. Follow [`DEPLOY_UBUNTU.md`](./DEPLOY_UBUNTU.md) for the complete Ubuntu deployment procedure. Copy `.env.production.example` to `.env.production` and never commit the populated file.

## Run the full application locally

1. Create a PostgreSQL database (or run `docker compose up -d db`) and copy `server/.env.example` to `server/.env`.
2. Set `DATABASE_URL` and replace `COOKIE_SECRET` with at least 32 random characters.
3. Install, migrate and seed:

```bash
pnpm install
pnpm migrate
pnpm --dir server seed:dev
```

4. Copy `.env.example` to `.env.local`, set `VITE_APP_MODE=api` and set `VITE_API_BASE_URL=http://localhost:3001`.
5. Start the API and frontend in two terminals:

```bash
pnpm dev:server
pnpm dev
```

The development seed uses password `SparkDemo2026!` for these accounts:

| Role | Email |
| --- | --- |
| Employee | `alex.stone@c-job.test` |
| Coordinator | `samuel.park@c-job.test` |
| GPM | `elena.volkova@c-job.test` |
| Head | `maya.chen@c-job.test` |
| Top Management | `victor.hale@c-job.test` |
| Administrator | `ida.novak@c-job.test` |

The seed is for local development only.

## Optional Microsoft account sign-in

Local email/password sign-in remains available. To add Microsoft Entra ID:

1. In Microsoft Entra admin center, create a **Web** app registration for this application.
2. Add `http://localhost:3001/api/v1/auth/microsoft/callback` as a development redirect URI.
3. Under **API permissions → Microsoft Graph → Delegated permissions**, add `User.Read` and `User.Read.All`, then grant tenant-wide admin consent. `User.Read.All` is used only to read the signed-in employee's manager.
4. Create a client secret for local development (use a certificate or workload identity in production).
5. Run the latest migration with `pnpm migrate`.
5. Add the following values to `server/.env` and restart the backend:

```dotenv
FRONTEND_ORIGIN=http://localhost:5173
MICROSOFT_AUTH_ENABLED=true
MICROSOFT_TENANT_ID=<directory-tenant-id>
MICROSOFT_CLIENT_ID=<application-client-id>
MICROSOFT_CLIENT_SECRET=<client-secret>
MICROSOFT_REDIRECT_URI=http://localhost:3001/api/v1/auth/microsoft/callback
```

The Microsoft button is always visible in API mode. It stays disabled with a setup hint until the five values above are configured and the backend is restarted.

The Microsoft work email does not need to exist in the employee directory before the first sign-in. The backend creates a passwordless `Pending` account and an access request. Microsoft Graph pre-fills full name, job title, department and manager. Department is authoritative from Microsoft: an existing case-insensitive Directory match is reused, an inactive match is reactivated, and a missing department is created automatically without a Head. A manager is selected automatically only when the manager's work email matches an active employee; otherwise the administrator chooses the correct record during approval. After approval, every Microsoft sign-in refreshes full name, job title, photo, department and the safe manager match.

The business role is an authorization value, not a Teams profile property. To suggest it securely from Microsoft, define exactly one Entra app role per employee using one of these values: `CJob.Employee`, `CJob.Coordinator`, `CJob.GPM`, `CJob.Head`, `CJob.TopManagement`, or `CJob.Administrator`. The signed and validated ID-token role is used to pre-fill the approval form; the administrator still confirms it. Existing approved role assignments are not silently changed by profile synchronization.

### Microsoft Graph email delivery

Reward purchases and Radiant fulfillment requests are written to the transactional outbox. To send real email, grant the Entra application the Microsoft Graph **Application** permission `Mail.Send`, grant tenant administrator consent, and add these values to `server/.env`:

```dotenv
MAIL_ENABLED=true
MAIL_SENDER_EMAIL=cjn-sparks@c-job.com.ua
# Optional when the SMTP address is not the mailbox UPN:
MAIL_SENDER_USER_ID=<mailbox-object-id-or-upn>
MAIL_SENDER_NAME=C-Job Sparks
MAIL_WORKER_INTERVAL_MS=5000
MAIL_MAX_ATTEMPTS=5
MAIL_BATCH_SIZE=10
```

The backend reuses `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`, obtains an app-only token, and sends through `/users/{MAIL_SENDER_USER_ID-or-MAIL_SENDER_EMAIL}/sendMail`. Failed messages retry with exponential backoff and become terminal after the configured attempt limit. Check the worker without exposing credentials at `GET /health/mail`.

Work email and profile photo are read-only inside C-Job Sparks: email is controlled by the employee directory and the photo is controlled by the Microsoft account. The local password form remains available for development accounts. Never commit the real client secret.

## Demo mode

Keep `VITE_APP_MODE=demo` to run only the browser demonstration. Demo data is isolated from API mode and is not a security or persistence implementation.

## Verification

```bash
pnpm lint
pnpm test
pnpm test:server
pnpm --dir server test:integration
pnpm build:all
pnpm verify:production-bundle
```

The full GitHub Actions pipeline also starts PostgreSQL, applies and verifies all migrations, seeds deterministic role fixtures, runs browser scenarios for all six roles, checks critical/serious accessibility issues with axe, and enforces Lighthouse budgets. To reproduce the browser stage locally after preparing the test database and building the backend:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:lighthouse
```

Set `VITE_PUBLIC_ORIGIN` to the public HTTPS origin during the production build. Canonical and Open Graph URLs are generated from this value; authenticated routes receive `noindex` metadata.

Microsoft sign-in and Graph mail are intentionally tested separately against staging because they require a real tenant, mailbox and authenticated session. Run the **Staging Microsoft and Graph smoke test** workflow manually and configure these protected staging secrets: `STAGING_BASE_URL`, `STAGING_MICROSOFT_SESSION_COOKIE`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MAIL_SENDER_USER_ID`. Supply the test recipient when starting the workflow.

## Backend guarantees

- Roles and department/project scope are read from the authenticated server session.
- The append-only Spark Ledger is the only balance source.
- Purchases, conversions, Disenchant, awards and recognition decisions use serializable database transactions.
- Financial POST requests require an `Idempotency-Key`.
- Prices, category amounts, quotas, conversion rates and balances are never trusted from the browser.
- Published rule/category/product versions and financial history are preserved; corrections use new versions or reversal entries.
- Administrators configure KPI and Personal Cards score bands in Admin Settings. The Rules page and future CSV previews use the active rule version; every preview keeps its original rule version through commit.
- Audit, notification and outbox rows are written with the related business transaction.
- Radiant awards create a separately tracked acrylic/vessel-model fulfillment request with a yearly valuable-prize snapshot.
- Physical Shop rewards, certificates and IT equipment create fulfillment requests; email recipients are placed in the transactional outbox for a future mail worker.
- A department Head can create one immutable current-month Disenchant report containing all new, previously unreported requests.
- Unsupported product effects cannot be purchased.
- Only Employee and Coordinator roles can use the personal economy. GPM and Head see only their personal Radiant ledger; Top Management can browse the shop but cannot purchase.
- Company Achievements are available to GPM, Head, Top Management and Administrator roles.

See [`server/README.md`](./server/README.md) for API and operational details and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for module boundaries.

## Repository layout

```text
src/                 React application and API/demo adapters
server/src/          Fastify modules
server/migrations/   versioned PostgreSQL schema
server/test/         backend domain and migration tests
docs/               business and production briefs, including the Radiant physical award concept
public/              frontend assets and CSV examples
tests/               frontend architecture and domain tests
```
