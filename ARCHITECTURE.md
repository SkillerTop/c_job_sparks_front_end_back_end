# Frontend architecture

## Overview

C-Job Sparks is a React 19 + TypeScript application built with Vite. The frontend is organized by responsibility rather than by a single large component tree.

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

Defines data operations. Current non-shop services implement the browser demonstration. `shopService` supports two adapters:

- `demo`: persistent browser-only data for standalone frontend review;
- `api`: authenticated HTTP calls to a future backend.

The API adapter uses cookies and does not trust role, balance, price or identity supplied by the browser.

### `models`

Contains shared TypeScript domain and transport types. Backend contracts should be generated or validated against these shapes once the server exists.

### `views`

Contains pages, feature components, common controls, layout and CSS modules. Pages should remain focused on composition; reusable workflow logic belongs in controllers or services.

### `data`

Contains demonstration fixtures only. Nothing in this directory should be treated as production data or an authorization source.

## State and persistence

Demo authentication, profile state and Spark workflows use browser storage or in-memory state. The demo Reward Shop uses namespaced local storage and can be reset by clearing browser site data.

Production must replace this with server-owned records. In particular:

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

## Backend integration rule

New backend calls should be added behind a service adapter. Views and CSS must not call `fetch` directly. Use one normalized error contract, trusted cookie-based sessions, idempotency keys for financial mutations and server-side pagination for growing collections.
