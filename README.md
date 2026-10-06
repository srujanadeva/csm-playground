# CSM Playground

A core-banking **Customer Service Management** back office, built for practising UI and API test automation on realistic, data-heavy screens: customer onboarding, customer search and 360 view, service requests, and an admin area that controls who sees which screen.

It is the next step after [test-playground](../test-playground): the same kinds of UI elements, but inside long forms, paginated tables and role-based flows that save to MongoDB. It is built the way a production app should be (OWASP Top 10 controls, layered server, shared validation), so it also works as a reference for what to test.

The sample data is set in Bengaluru: Indian names, +91 mobile numbers, amounts in ₹, and three branches (MG Road, Jayanagar, Whitefield). The interface is in **English and Kannada**.

> **Status:** every screen from the [mockups](docs/mockups) is built and saves to MongoDB. Next up: written practice exercises and a Playwright E2E suite. See [Roadmap](#roadmap).

---

## Prerequisites

| Tool                                | Version     | Notes                                             |
| ----------------------------------- | ----------- | ------------------------------------------------- |
| Node.js                             | 20 or newer | Installed by setup if missing                     |
| MongoDB Community                   | any         | An existing install is used; new installs get 8.0 |
| Homebrew (macOS) / winget (Windows) | —           | Only needed if something has to be installed      |
| A modern browser                    | latest      | Chrome, Edge, Firefox or Safari                   |

The app shares the local MongoDB with test-playground but uses its own database, `csm_playground`, and its own ports, so both can run at the same time.

## Setup

```bash
npm run setup        # macOS
npm run setup:win    # Windows (PowerShell)
```

Setup follows one rule for every step: **if it's already there, use it; if it's missing, create it.** Nothing existing is replaced, and it is safe to re-run.

| Step                     | Already there                        | Missing                                                                            |
| ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------- |
| Node.js 20+              | Used as is                           | Installed (Homebrew / winget)                                                      |
| npm dependencies         | `npm ci` from the lockfile           | Installed                                                                          |
| Dev TLS certs (`certs/`) | Kept                                 | Self-signed `localhost` cert generated                                             |
| `server/.env`            | Kept; only missing secrets are added | Created from `.env.example` with random `JWT_SECRET`, `CSRF_SECRET`, `PII_ENC_KEY` |
| MongoDB                  | Used as is (any version)             | MongoDB 8.0 installed                                                              |
| MongoDB running          | Used as is                           | Started                                                                            |
| Seed data                | Left as is                           | Screens, roles, staff users, 1,200 customers, 300 service requests                 |

At the end, the seed prints **one-time passwords** for the staff users. They are shown once and stored only as bcrypt hashes; each user must choose a new password at first sign-in. To use a known practice password instead:

```bash
npm run seed -- --reset-passwords --demo   # every staff user gets: Namma-Bengaluru-2026
```

## Running

```bash
npm run start:all       # macOS: starts MongoDB, the API and the web app
npm run start:all:win   # Windows
npm run stop:all        # stops all three (MongoDB too, which test-playground also uses)
```

| What    | URL                           |
| ------- | ----------------------------- |
| Web app | https://localhost:3001        |
| API     | https://localhost:4001/api/v1 |

Both use the self-signed dev certificate, so the browser asks you to accept it once. HTTPS is required because the session and CSRF cookies are `Secure`.

If MongoDB is already running, `npm run dev` starts just the API and web app.

## Staff users

| Staff ID   | Name            | Role                                               | Branch          |
| ---------- | --------------- | -------------------------------------------------- | --------------- |
| `admin001` | Raghavendra Rao | Administrator                                      | 0001 MG Road    |
| `sup001`   | Naveen Gowda    | Supervisor                                         | 0001 MG Road    |
| `sup002`   | Sowmya Murthy   | Supervisor                                         | 0004 Jayanagar  |
| `sup003`   | Prasanna Kamath | Supervisor                                         | 0007 Whitefield |
| `csr001`   | Kavya Hegde     | Customer service rep (+ Export on Customer search) | 0001 MG Road    |
| `csr002`   | Arun Shetty     | Customer service rep                               | 0004 Jayanagar  |
| `csr003`   | Harish Kumar    | Customer service rep                               | 0007 Whitefield |
| `csr004`   | Deepa Bhat      | Customer service rep, **deactivated**              | 0007 Whitefield |

| Role       | Can                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| CSR        | Onboard, search (PII masked), view and edit customers, request block/unblock, create and work requests |
| Supervisor | Everything a CSR can, plus approve/reject, see PII, close requests, export                             |
| Admin      | Everything, in every branch, plus Users & access and Screen configuration                              |

Admins can change any of this per user or per screen; changes reach signed-in users within 30 seconds.

## Screens

| Screen               | Route                   | Who sees it                    | What to practise                                                                                                                                                                                  |
| -------------------- | ----------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in              | `/login`                | everyone                       | lockout countdown, show/hide password, "remember this device", language switch                                                                                                                    |
| Change password      | `/change-password`      | users with a one-time password | password rules, server-side "too common" check                                                                                                                                                    |
| Dashboard            | `/dashboard`            | all roles                      | tiles, approval queue with confirm dialogs, paginated lists                                                                                                                                       |
| Onboard customer     | `/customers/new`        | CSR, supervisor, admin         | 4-step wizard, draft save and resume (`?draft=`), radios, date inputs, slider + number input, toggle tags, conditional fields, masked ID with show/hide, uploads with progress, submit validation |
| Customer search      | `/customers`            | all roles                      | filters kept in the URL, sortable columns, page numbers and "go to page", rows per page, tooltips, row menus with disabled items, CSV export                                                      |
| Customer 360         | `/customers/:cif`       | all roles                      | tabs that load on first open, infinite-scroll audit log, edit drawer, block/unblock (maker-checker), approve from the banner, audited ID reveal                                                   |
| New request          | `/service-requests/new` | CSR, supervisor, admin         | debounced typeahead, dependent dropdowns, SLA set from priority, character counter, queued attachments, idempotent submit                                                                         |
| Request board        | `/service-requests`     | CSR, supervisor, admin         | drag and drop between columns, per-column infinite scroll, resolve dialog, "closing needs Approve", list view with paging                                                                         |
| Users & access       | `/admin/users`          | admin only                     | permission matrix (role vs per-user), unlock, one-time password reset, deactivate, new user                                                                                                       |
| Screen configuration | `/admin/screens`        | admin only                     | drag to reorder the menu, on/off switches with impact warning, capabilities, hide-vs-disable, page-size limits, roles with access                                                                 |

Screens a user can't open aren't in their menu, and their URLs show Not Found. The browser only downloads the code for screens the user opens.

### Locators

Every control follows one contract, so tests don't depend on text or language:

| Thing                    | Locator                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Inputs, selects, buttons | `id` = `data-testid` = `<screen>-<section>-<field>`, e.g. `onb-personal-first-name`, `search-submit` |
| Field errors             | `<id>-error` with `role="alert"`, e.g. `onb-kyc-expiry-date-error`                                   |
| Radio / checkbox options | `<group-id>-<value>`, e.g. `onb-personal-gender-female`, `sr-new-priority-high`                      |
| Table rows               | `data-testid="<table>-row"` plus `data-row-id` (CIF, SR number or staff ID)                          |
| Async areas              | `data-state` = `loading`, `loaded`, `empty` or `error`; paged tables also expose `data-page`         |
| Board                    | columns `board-column-<status>`, cards `board-card` with `data-sr-no` and `data-status`              |
| Menu                     | `nav-<screenKey>`, e.g. `nav-customers.search`                                                       |
| Toasts and dialogs       | `toast` (with `data-kind`), dialogs by their `data-testid` with `-confirm` / `-cancel` buttons       |

## Sample data

The seed is deterministic: every machine gets the same customers, so exercises can name specific records.

| Record           | What it is                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| `CIF-000124`     | Ananya Rao: active, PEP, medium risk, passport, with an open high-priority request that has just missed its SLA |
| `CIF-000123`     | Kiran Gowda                                                                                                     |
| `CIF-000122`     | Shreya Hegde: active, KYC verified                                                                              |
| `CIF-000121`     | Manjunath Shetty: blocked, passport expired                                                                     |
| Customers        | 1,200 (active, blocked, closed, awaiting approval, and drafts without a CIF yet)                                |
| Service requests | 300 over the last 120 days, with comments, across all statuses                                                  |
| Approvals        | Activation and block requests, some still pending for supervisors                                               |

Reset the business data at any time (staff, screens and roles are kept):

```bash
npm run seed -- --fresh
```

## API

All paths are under `https://localhost:4001/api/v1`. Every error is `application/problem+json` with a `requestId`; field errors carry a translatable `code` and an English `message`. State-changing requests need the `X-CSRF-Token` header (from `GET /auth/csrf`, also returned by sign-in), and create endpoints accept an `Idempotency-Key` header.

| Area                       | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System                     | `GET /health`, `GET /ready`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Auth                       | `GET /auth/csrf`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`, `PUT /auth/me/language`                                                                                                                                                                                                                                                                                                                                                                                                          |
| Lookups                    | `GET /lookups/:type?parent=`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Customers                  | `GET /customers` (filters, `page`, `pageSize`, `sort`), `GET /customers/export.csv`, `GET /customers/typeahead?q=`, `POST /customers` (new draft), `GET /customers/:ref/form`, `PATCH /customers/:ref/draft`, `POST /customers/:ref/submit`, `GET /customers/:ref`, `PATCH /customers/:ref`, `POST /customers/:ref/reveal-id`, `GET /customers/:ref/audit` and `/service-requests` (cursor), `POST /customers/:ref/block-requests` and `/unblock-requests`, `POST /customers/:ref/documents`, `GET /customers/:ref/documents/:id/content` |
| Approvals                  | `GET /approvals`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject`                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Service requests           | `GET /service-requests/assignees`, `POST /service-requests`, `GET /service-requests/board?status=` (cursor), `GET /service-requests` (pages), `GET /service-requests/export.csv`, `GET /service-requests/:srNo`, `PATCH /service-requests/:srNo/status`, `GET` and `POST /service-requests/:srNo/comments`, `POST /service-requests/:srNo/attachments`                                                                                                                                                                                    |
| Admin (404 for non-admins) | `GET` and `POST /admin/users`, `GET` and `PATCH /admin/users/:staffId`, `POST /admin/users/:staffId/unlock`, `/reset-password`, `/deactivate`, `/activate`, `GET /admin/screens`, `PATCH /admin/screens/:key`, `PUT /admin/screens/order`, `PUT /admin/screens/:key/roles`, `GET /admin/screens/:key/impact`, `GET /admin/roles`                                                                                                                                                                                                          |
| Dashboard                  | `GET /dashboard/summary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

[docs/security.md](docs/security.md) lists the security controls and ready-made negative tests.

## Quality checks

```bash
npm run check   # lint, format, type-check, tests, dependency audit
```

| Script                 | What it runs                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint (TypeScript, React hooks, bans `eval` and `dangerouslySetInnerHTML`)                                                                          |
| `npm run format:check` | Prettier                                                                                                                                             |
| `npm run typecheck`    | `tsc` in every workspace                                                                                                                             |
| `npm test`             | Vitest: shared rules (permissions, KYC, risk), server units, and API integration tests against MongoDB (`csm_playground_test`, skipped if it's down) |
| `npm run audit:deps`   | `npm audit` for high-severity issues in runtime dependencies                                                                                         |

## Tech stack

| Layer    | Technology                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web      | React 19, TypeScript, Vite, React Router, TanStack Query, react-hook-form + zod, react-i18next, self-hosted IBM Plex and Noto Sans Kannada fonts |
| API      | Express 5, TypeScript (run with `tsx`), Mongoose 9, zod 4, multer                                                                                |
| Security | helmet, signed double-submit CSRF, express-rate-limit, bcrypt, AES-256-GCM field encryption                                                      |
| Logging  | pino with redaction                                                                                                                              |
| Tests    | Vitest, Supertest (Playwright E2E suite next)                                                                                                    |
| Database | MongoDB, database `csm_playground`                                                                                                               |

No UI component library: every control is native or hand-built, so locators stay predictable.

## Project structure

```
csm-playground/
  shared/          zod schemas, enums, screen/role definitions, permission resolver, risk rating, masking, response types
  server/
    src/
      app.ts       Express app: security middleware, routes, error handling
      config.ts    settings validated at startup
      lib/         crypto, sessions, pagination, uploads, CSV, audit, logger, passwords, errors
      middleware/  auth (session, capability checks), CSRF, rate limits, idempotency, operator rejection, errors
      modules/     one folder per area: auth, admin, customers, serviceRequests, approvals, lookups, dashboard, audit, system
      seed/        deterministic sample data
    test/          unit and API integration tests
  web/
    src/
      app/         auth context, permission hooks, shell, idle timeout, route guards
      components/  form fields, dialogs, drawer, toasts, tabs, stepper, pagination, typeahead, drop zone
      modules/     auth, dashboard, customers (onboard, search, c360), requests, admin
      locales/     en/ and kn/ JSON, one file per module
  scripts/         setup / start / stop for macOS (.sh) and Windows (.ps1)
  docs/            security.md, architecture.md, mockups/
```

## Roadmap

| Phase | Scope                                                                                                                      | Status   |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0     | Image mockups                                                                                                              | Done     |
| 1     | Project skeleton, security baseline, models, seed, scripts                                                                 | Done     |
| 2     | All mockup screens and their APIs: sign-in, sessions, permission-driven shell, English/Kannada, every CSM and admin screen | **Done** |
| 3     | Practice exercises (beginner → advanced), Playwright E2E and security test suite, CI                                       | Next     |

## Troubleshooting

| Problem                                 | Fix                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Invalid server configuration` on start | A secret in `server/.env` is missing or still `change-me`. Run `npm run setup`; it only fills in what's missing. |
| `Dev TLS certs are missing`             | Run `npm run setup`, or delete `certs/` and run it again to make new ones.                                       |
| "Can't reach the server" on sign-in     | The API or MongoDB isn't running: `npm run start:all` starts both.                                               |
| Browser warns about the certificate     | Expected for the self-signed dev cert; accept it for `localhost`.                                                |
| Account locked during practice          | Sign in as `admin001` and use **Unlock account**, or run `npm run seed -- --reset-passwords --demo`.             |
| Signed out after 15 minutes             | That's the idle timeout. Set `SESSION_IDLE_MINUTES` in `server/.env` (1–120) to change it.                       |
| Lost the one-time passwords             | `npm run seed -- --reset-passwords` prints new ones (add `--demo` for the known password).                       |
