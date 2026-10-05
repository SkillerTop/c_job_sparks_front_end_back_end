# C-Job Sparks backend

The backend is a modular monolith built with Fastify, TypeScript and PostgreSQL. Its public contract is rooted at `/api/v1`; the original shop URLs under `/api/shop` remain as compatibility aliases for the existing frontend.

## Setup

```bash
copy .env.example .env
pnpm install
pnpm migrate
pnpm seed:dev
pnpm dev
```

Use PostgreSQL 15 or newer. The migrations enable `pgcrypto`, `citext` and `btree_gist`, so the database user must be allowed to create those extensions.

## Implemented modules

- local authentication, Argon2id, access approval, password reset tokens, session revocation and login lockouts;
- employees, departments, roles, projects, teams and server-side scope checks;
- append-only Spark Ledger, immutable operations, balance projections and idempotency;
- Peer Recognition, Awards, quotas, Approval Center and Quality Gates;
- achievements and atomic CSV Performance preview/commit;
- White→Yellow and Yellow→Blue conversions with versioned rules and fees;
- Disenchant debit/snapshot/export/paid workflow;
- versioned Reward Shop, atomic purchase, stock movements, inventory effects and local image storage;
- profile preferences, sessions, in-app notifications, audit events and transactional outbox.

Email delivery, Entra ID, accounting payouts, Teams and external HR/Performance sources are adapter boundaries. Email change deliberately returns `EMAIL_SERVICE_NOT_CONFIGURED` until a real mail provider is configured.

## Operational endpoints

- `GET /health/live`
- `GET /health/ready`

## Database rules

The migration runner uses an advisory lock and validates the checksum of every applied migration. Never edit a migration after it has been applied to an environment; add a new numbered migration instead.

Ledger entries, approvals, achievements, stock movements, inventory events and audit events are append-only at the database level. Published category/rule/product rows may only be closed and replaced with a new version.

Uploaded shop images are stored below `MEDIA_ROOT`; database rows retain their hash and metadata. Production deployments should mount persistent storage or replace this local adapter with object storage.

## Important API behavior

- Authentication uses the configured `HttpOnly` cookie. It is `Secure` in production and always `SameSite=Lax`.
- Credentialed CORS origins must be explicit; `*` is rejected.
- Financial mutations require `Idempotency-Key` (8–255 characters).
- Errors use `{ code, message, details?, requestId }`.
- Collection endpoints are role/scope filtered. Supplying another employee ID never expands access.
