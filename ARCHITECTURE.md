# Full-stack architecture

## Overview

C-Job Sparks combines a React 19 + TypeScript client with a Fastify/PostgreSQL modular monolith. The frontend is organized by responsibility rather than by a single large component tree.

```text
BrowserRouter
  AuthProvider
    UserPreferencesProvider
      SparkProvider
        ShopProvider
          AppRouter
            route guards
            page controllers
            views and reusable components
```

## Layers

### `app`

Owns route composition, authenticated/guest boundaries, role guards, lazy loading and route metadata. Route visibility improves UX but is not a security boundary; a production backend must repeat every authorization check.

### `controllers`

Connects pages to application state and services. Controllers contain orchestration and mutation state so presentational components do not duplicate data logic.

### `services`

Defines data operations. Every stateful service has two adapters:

- `demo`: persistent browser-only data for standalone frontend review;
- `api`: authenticated HTTP calls to the included backend.

The API adapter uses cookies and does not trust role, balance, price or identity supplied by the browser.

### `models`

Contains shared TypeScript domain and transport types. Runtime validation remains server-owned; transport types keep the current UI adapter boundary explicit.

### `views`

Contains pages, feature components, common controls, layout and CSS modules. Pages should remain focused on composition; reusable workflow logic belongs in controllers or services.

### `data`

Contains demonstration fixtures only. Nothing in this directory should be treated as production data or an authorization source.

## State and persistence

Demo authentication, profile state and Spark workflows use browser storage or in-memory state. API mode stores durable data in PostgreSQL and treats server sessions, directory records and ledger projections as authoritative.

In API mode:

- the Spark Ledger must be the only authoritative balance source;
- purchases, conversions and Disenchant requests must be atomic;
- product price and award amount must be re-read by the server;
- roles and organizational scope must come from the authenticated session;
- historical operations must be append-only.

## Configuration

Only public Vite configuration uses `VITE_*` variables. Secrets must never be put in frontend environment files because all bundled values are visible to users.

`VITE_BASE_PATH` controls the Vite asset base and the React Router basename. Deployments must still provide an SPA history fallback to `index.html`.

## Accessibility and responsiveness

The interface uses semantic controls, explicit labels, keyboard-operable dialogs, visible focus states, reduced-motion support, responsive grids and mobile navigation. Changes should be checked at 320 px, tablet widths, desktop widths and 200% text zoom.

## Backend modules

The server is split by business boundary rather than deployed as microservices:

```text
HTTP routes
  authentication and authorization
  recognition / awards / approvals
  ledger / conversion / disenchant
  performance imports
  shop / inventory / media
  workspace read model
    PostgreSQL transactions and migrations
      audit + notifications + outbox
```

`spark_ledger_entries`, approval history, achievements, stock movements, inventory events and audit events are append-only. `spark_accounts` and `product_stock` are projections changed only by database triggers. Serializable transactions and idempotency records protect financial operations from races and retries.

The server separates the local credential record (`users`) from the employee profile (`employees`) so a future Entra ID adapter does not change the organizational or economy model.

## Backend integration rule

New backend calls belong behind a service adapter. Views and CSS must not call `fetch` directly. Use the normalized error contract, trusted cookie-based sessions and idempotency keys for financial mutations. Add cursor pagination before production datasets outgrow the bounded MVP collection endpoints.
