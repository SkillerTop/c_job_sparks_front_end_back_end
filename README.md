# C-Job Sparks Frontend

Clean frontend-only repository for the C-Job Sparks employee recognition and rewards workspace.

The package contains the current responsive interface, role-aware navigation, recognition and award workflows, achievements with performance data, Spark economy, Reward Shop, profile settings, administration screens, localization, light/dark themes, and accessibility states.

## Requirements

- Node.js 24 or newer
- pnpm 11.25 or newer

## Start locally

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite.

## Verify and build

```bash
pnpm lint
pnpm test
pnpm build
pnpm preview
```

The production bundle is written to `dist/` and is not committed.

## Demo access

The repository is intentionally self-contained and uses browser demo data by default.

Shared demo password:

```text
SparkDemo2026!
```

Representative accounts:

| Role | Email |
| --- | --- |
| Employee | `alex.stone@c-job.test` |
| Coordinator | `samuel.park@c-job.test` |
| GPM | `elena.volkova@c-job.test` |
| Head | `maya.chen@c-job.test` |
| Top Management | `victor.hale@c-job.test` |
| Administrator | `ida.novak@c-job.test` |

Demo changes are stored only in the current browser. Clearing site data restores the initial state.

## Environment

Copy `.env.example` to `.env.local` only when a non-default configuration is needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SHOP_MODE` | `demo` | Use `demo` for browser storage or `api` for a real backend |
| `VITE_API_BASE_URL` | empty | Optional backend origin when API mode is enabled |
| `VITE_BASE_PATH` | `/` | Public base path, for example `/c-job-sparks/` |

When `VITE_SHOP_MODE=api`, the browser no longer sends demo identity headers. Authentication and authorization must be provided by the backend through a trusted session.

## Backend boundary

This repository does not contain a database, migrations, Worker, API server, secrets, or production authentication. Most workflows currently use the frontend demo services. API mode is prepared for the Reward Shop contract:

- `GET /api/shop`
- `POST /api/shop/purchase`
- `POST /api/shop/inventory/:id/activate`
- `GET /api/shop/admin`
- `POST /api/shop/admin/products`
- `POST /api/shop/admin/balances/adjust`
- `POST /api/shop/admin/images`

Before production use, the remaining demo services must be replaced with authenticated API adapters and a single authoritative Spark Ledger.

## Repository structure

```text
src/
  app/          routing, guards, route metadata
  constants/    navigation, labels, translations and shop copy
  controllers/  page orchestration and React contexts
  data/         clearly isolated demonstration fixtures
  hooks/        reusable interaction hooks
  models/       TypeScript domain and view models
  services/     demo state and API adapters
  utils/        formatting, CSV parsing and business-rule helpers
  views/        pages, components and styles
public/         brand, fonts, Spark icons, shop images and CSV samples
tests/          frontend architecture, auth and domain tests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for integration boundaries and conventions.

## GitHub handoff

The repository intentionally excludes:

- `.env` files;
- `node_modules/`;
- `dist/`;
- hosting configuration;
- backend and database code;
- generated files and local tooling state.

Create an empty GitHub repository, then add its URL as `origin` and push the desired branch. No credentials are stored in this package.
