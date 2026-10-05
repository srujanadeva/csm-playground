# CSM Playground

A core-banking **Customer Service Management** back office, built for practising UI and API test automation on realistic, data-heavy screens: customer onboarding, customer search and 360 view, service requests, and an admin area that controls who sees which screen.

It is the next step after [test-playground](../test-playground): the same kinds of UI elements, but inside long forms, paginated tables and role-based flows that save to MongoDB. It is built the way a production app should be (OWASP Top 10 controls, layered server, shared validation), so it also works as a reference for what to test.

The sample data is set in Bengaluru: Indian names, +91 mobile numbers, amounts in ₹, and three branches (MG Road, Jayanagar, Whitefield). The interface is in **English and Kannada**.

> **Status: phase 1 of 7.** The project skeleton, security baseline, data models and seed data are in place. The web app currently shows a system status page. Sign-in and the app shell arrive in phase 2, then the admin screens and the three CSM screens. See [Roadmap](#roadmap).

Screen mockups for every planned screen are in [docs/mockups](docs/mockups).

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

## API (phase 1)

Every error is returned as `application/problem+json` with a `requestId` you can match to the server log.

| Method & path           | Purpose                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`    | Liveness: the API is up                                                                             |
| `GET /api/v1/ready`     | Readiness: 200 when MongoDB answers, otherwise 503                                                  |
| `GET /api/v1/auth/csrf` | Issues a CSRF token (cookie + body). Send it in `X-CSRF-Token` on every POST, PUT, PATCH and DELETE |

Things you can already test against the API are listed in [docs/security.md](docs/security.md#what-you-can-test-today).

## Quality checks

```bash
npm run check   # lint, format, type-check, unit and API tests, dependency audit
```

| Script                 | What it runs                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint (TypeScript, React hooks, bans `eval` and `dangerouslySetInnerHTML`)               |
| `npm run format:check` | Prettier                                                                                  |
| `npm run typecheck`    | `tsc` in every workspace                                                                  |
| `npm test`             | Vitest: permission rules, masking, config, encryption, pagination, and API security tests |
| `npm run audit:deps`   | `npm audit` for high-severity issues in runtime dependencies                              |

## Tech stack

| Layer    | Technology                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| Web      | React 19, TypeScript, Vite (React Router, TanStack Query, react-hook-form and react-i18next arrive in phase 2) |
| API      | Express 5, TypeScript (run with `tsx`), Mongoose 9, zod 4                                                      |
| Security | helmet, signed double-submit CSRF, express-rate-limit, bcrypt, AES-256-GCM field encryption                    |
| Logging  | pino with redaction                                                                                            |
| Tests    | Vitest, Supertest (Playwright E2E in phase 7)                                                                  |
| Database | MongoDB, database `csm_playground`                                                                             |

No UI component library: every control is native or hand-built, so locators stay predictable.

## Project structure

```
csm-playground/
  shared/          zod schemas, enums, screen and role definitions, permission resolver, masking
  server/
    src/
      app.ts       Express app: security middleware, routes, error handling
      config.ts    settings validated at startup
      lib/         crypto, pagination, audit, logger, passwords, errors
      middleware/  request id, CSRF, rate limits, operator rejection, error handler
      modules/     one folder per area: auth, admin, customers, serviceRequests, approvals, lookups, audit, system
      seed/        deterministic sample data
    test/          unit and API tests
  web/             React + Vite app
  scripts/         setup / start / stop for macOS (.sh) and Windows (.ps1)
  docs/            security.md, architecture.md, mockups/
```

## Roadmap

| Phase | Scope                                                                            | Status   |
| ----- | -------------------------------------------------------------------------------- | -------- |
| 0     | Image mockups                                                                    | Done     |
| 1     | Project skeleton, security baseline, models, seed, scripts                       | **Done** |
| 2     | Sign-in, lockout, sessions, `/auth/me`, permission-driven shell, English/Kannada | Next     |
| 3     | Admin: users & access, screen configuration                                      |          |
| 4     | Onboard customer wizard                                                          |          |
| 5     | Customer search, Customer 360, maker-checker block                               |          |
| 6     | Service requests: new request, board and list                                    |          |
| 7     | Docs, practice exercises, Playwright E2E and security tests                      |          |

## Troubleshooting

| Problem                                 | Fix                                                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Invalid server configuration` on start | A secret in `server/.env` is missing or still `change-me`. Run `npm run setup`; it only fills in what's missing. |
| `Dev TLS certs are missing`             | Run `npm run setup`, or delete `certs/` and run it again to make new ones.                                       |
| Status page shows Database **Down**     | MongoDB isn't running: `npm run start:all` starts it.                                                            |
| Browser warns about the certificate     | Expected for the self-signed dev cert; accept it for `localhost`.                                                |
| Lost the one-time passwords             | `npm run seed -- --reset-passwords` prints new ones (add `--demo` for the known password).                       |
