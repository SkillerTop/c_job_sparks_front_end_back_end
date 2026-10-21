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

- local authentication, Argon2id, Microsoft Entra ID with PKCE, access approval, password reset tokens, session revocation and login lockouts;
- employees, departments, roles, projects, teams and server-side scope checks;
- append-only Spark Ledger, immutable operations, balance projections and idempotency;
- Peer Recognition, Awards, quotas, Approval Center and Quality Gates;
- achievements and atomic CSV Performance preview/commit with versioned, administrator-managed reward thresholds;
- White→Yellow and Yellow→Blue conversions with versioned rules and fees;
- Disenchant debit/snapshot/export/paid workflow;
- versioned Reward Shop, atomic purchase, stock movements, inventory effects and local image storage;
- read-only work identity, Microsoft Graph profile synchronization (name, photo, job title, department and manager), Entra app-role suggestions, profile preferences, sessions, in-app notifications, audit events and transactional outbox;
- Microsoft Graph app-only mail delivery for reward fulfillment, with row locking, retries, dead-letter state and delivery health status;
- reward fulfillment for Radiant awards and Shop orders, including the configured directors, office managers and department heads;
- one-per-department monthly Disenchant reports with an immutable request-to-report link and CSV output.

Reward fulfillment email messages are emitted transactionally to `outbox_events` with an `emailTo` list. When `MAIL_ENABLED=true`, the Graph mail worker sends them from `MAIL_SENDER_EMAIL`. Events created before migration `0016` are deliberately marked as skipped so enabling delivery cannot send historical test purchases.

The mail worker uses the existing Entra application credentials with the Microsoft Graph **Application** permission `Mail.Send` and tenant administrator consent:

```dotenv
MAIL_ENABLED=true
MAIL_SENDER_EMAIL=sparks@c-job-ua.com
# Set this only when the email address is an alias rather than the mailbox UPN.
MAIL_SENDER_USER_ID=<mailbox-object-id-or-upn>
MAIL_SENDER_NAME=C-Job Sparks
MAIL_WORKER_INTERVAL_MS=5000
MAIL_MAX_ATTEMPTS=5
MAIL_BATCH_SIZE=10
```

`MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` are shared with Microsoft sign-in. Never commit the secret. For production, prefer a separate mail application with certificate/workload credentials and Exchange Online Application RBAC restricted to the sender mailbox.

Email delivery, accounting payouts and external HR/Performance sources are adapter boundaries. Teams and Microsoft 365 directory data is read through Microsoft Graph during Entra sign-in; the server requires delegated `User.Read` and `User.Read.All` consent. Microsoft `department` is authoritative: the matching internal department is reused or created automatically, while the department Head remains an internal assignment. Work email is controlled by the employee directory and cannot be changed through the profile API. Profile photos are synchronized from Microsoft Graph and cannot be uploaded locally.

## Operational endpoints

- `GET /health/live`
- `GET /health/ready`
- `GET /health/mail`

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
- Employee and Coordinator are the only roles with purchasing, conversion and Disenchant access. GPM and Head personal Ledger endpoints expose only Radiant entries; Top Management can browse the shop without purchasing.
- Deleting an employee immediately revokes access and removes the person from Directory. A record without history is removed physically; a record referenced by immutable Ledger or business history is pseudonymized and retained only as a technical tombstone so those records remain valid.
