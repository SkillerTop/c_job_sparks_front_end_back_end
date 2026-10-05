# C-Job Sparks

C-Job Sparks is a full-stack employee recognition and rewards application. The existing React 19 interface can still run as a self-contained demo, or it can use the included Fastify/PostgreSQL backend as the authoritative source for identity, roles, organizational scope and the Spark economy.

## Stack

- React 19, TypeScript and Vite
- Node.js 24 and Fastify 5
- PostgreSQL 15+
- Argon2id passwords and opaque server-side sessions
- pnpm workspace

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

## Demo mode

Keep `VITE_APP_MODE=demo` to run only the browser demonstration. Demo data is isolated from API mode and is not a security or persistence implementation.

## Verification

```bash
pnpm lint
pnpm test
pnpm test:server
pnpm build:all
```

## Backend guarantees

- Roles and department/project scope are read from the authenticated server session.
- The append-only Spark Ledger is the only balance source.
- Purchases, conversions, Disenchant, awards and recognition decisions use serializable database transactions.
- Financial POST requests require an `Idempotency-Key`.
- Prices, category amounts, quotas, conversion rates and balances are never trusted from the browser.
- Published rule/category/product versions and financial history are preserved; corrections use new versions or reversal entries.
- Audit, notification and outbox rows are written with the related business transaction.
- Unsupported product effects cannot be purchased.

See [`server/README.md`](./server/README.md) for API and operational details and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for module boundaries.

## Repository layout

```text
src/                 React application and API/demo adapters
server/src/          Fastify modules
server/migrations/   versioned PostgreSQL schema
server/test/         backend domain and migration tests
public/              frontend assets and CSV examples
tests/               frontend architecture and domain tests
```
