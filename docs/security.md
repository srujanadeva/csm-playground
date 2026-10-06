# Security controls

How CSM Playground addresses the **OWASP Top 10 (2025)**, where each control lives in the code, and what you can test. Every control in the "What you can test" tables is covered by an automated test (`server/test/app.test.ts`, `server/test/api.integration.test.ts`).

## Threat model in brief

| Asset                                      | Threat                                           | Main controls                                                                      |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Customer PII (ID numbers, mobiles, emails) | Disclosure through the API, logs or the database | Field encryption, masking without `viewPII`, audited reveal, log redaction         |
| Staff accounts                             | Password guessing, session theft                 | bcrypt, lockout, breached-password check, httpOnly SameSite cookies, idle timeout  |
| Customer status (block / activate)         | One person abusing access                        | Maker-checker approvals, audit log                                                 |
| Screen and role configuration              | Privilege escalation                             | Admin-only screens enforced on the server, 404 for non-admins, self-protection     |
| The API itself                             | Injection, CSRF, replay, flooding                | zod strict schemas, operator rejection, CSRF tokens, idempotency keys, rate limits |

## OWASP Top 10 (2025) mapping

| #   | Risk                                  | Control                                                                                                                                                                                  | Where                                                                      |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| A01 | Broken Access Control                 | Deny by default: every route names the screen capability it needs (`requireCapability`); denials are audited                                                                             | `server/src/middleware/auth.ts`, each `modules/*/routes.ts`                |
|     |                                       | Effective permissions = role grants + per-user grants − revokes, only on enabled screens; admin-only screens can never be granted to non-admins                                          | `shared/src/permissions.ts`                                                |
|     |                                       | Admin API answers **404** to non-admins (its existence isn't revealed); the UI shows Not Found too                                                                                       | `requireAdmin`, `web/src/app/guards.tsx`                                   |
|     |                                       | Branch scoping: non-admins only read and write records in their own branch                                                                                                               | `branchScope()` in services                                                |
|     |                                       | Self-protection: an admin can't demote or deactivate themselves, and admin screens can't be switched off                                                                                 | `server/src/modules/admin/service.ts`                                      |
| A02 | Security Misconfiguration             | Strict CSP (`script-src 'self'`, `style-src 'self'`, `frame-ancestors 'none'`), nosniff, `Referrer-Policy: no-referrer`, no `X-Powered-By`, `Cache-Control: no-store` on the API         | `server/src/app.ts`                                                        |
|     |                                       | Fonts are self-hosted, so the CSP never needs a third-party origin                                                                                                                       | `web/src/main.tsx`                                                         |
|     |                                       | HSTS in production only (on `localhost` it would force HTTPS on every other local app)                                                                                                   | `server/src/app.ts`                                                        |
|     |                                       | Config validated at startup; refuses missing, short or `change-me` secrets without printing values                                                                                       | `server/src/config.ts`                                                     |
| A03 | Software Supply Chain Failures        | Exact versions, committed lockfile, `npm ci` in setup, `npm audit` in `npm run check`, Dependabot                                                                                        | `.npmrc`, `scripts/setup.*`, `.github/dependabot.yml`                      |
| A04 | Cryptographic Failures                | Passwords: bcrypt cost 12. ID numbers: AES-256-GCM plus a keyed HMAC blind index for exact search                                                                                        | `server/src/lib/password.ts`, `server/src/lib/crypto.ts`                   |
|     |                                       | Mobiles, emails and IDs masked unless the caller has `viewPII`; revealing an ID number is a separate, audited call                                                                       | `shared/src/mask.ts`, `customers/dto.ts`, `POST /customers/:cif/reveal-id` |
|     |                                       | HTTPS everywhere in dev; secrets only in `server/.env` (gitignored, mode 600)                                                                                                            | `scripts/setup.*`                                                          |
| A05 | Injection                             | Requests with `$`-prefixed or dotted keys are rejected (400); Mongoose `strictQuery` and `sanitizeFilter`; server-built operators are explicitly trusted with `op()`                     | `middleware/rejectOperators.ts`, `db.ts`, `lib/query.ts`                   |
|     |                                       | zod **strict** schemas on every body and query (unknown fields rejected); sort fields whitelisted; search text escaped and length-capped                                                 | `shared/src/schemas/`, `lib/pagination.ts`, `lib/regex.ts`                 |
|     |                                       | CSV exports prefix cells starting with `= + - @` so spreadsheets don't run them as formulas                                                                                              | `server/src/lib/csv.ts`                                                    |
|     |                                       | React escaping only; ESLint bans `dangerouslySetInnerHTML`, `eval` and `new Function`                                                                                                    | `eslint.config.js`                                                         |
| A06 | Insecure Design                       | Maker-checker: activation, block and unblock take effect only when someone else with `approve` agrees; you can't decide your own request                                                 | `server/src/modules/approvals/service.ts`                                  |
|     |                                       | Service-request state machine; closing needs `approve`; resolving needs notes                                                                                                            | `shared/src/enums.ts`, `serviceRequests/service.ts`                        |
|     |                                       | Rate limits: 600/min per IP for the API, 20 per 15 min per IP + staff ID for sign-in and password change                                                                                 | `server/src/middleware/rateLimit.ts`                                       |
| A07 | Authentication Failures               | Lockout after 5 failures until an admin unlocks; unknown staff IDs get the same responses and bcrypt timing (no account enumeration)                                                     | `server/src/modules/auth/service.ts`                                       |
|     |                                       | Passwords: 12–128 characters, no common/breached passwords (bundled SecLists list), no staff ID or name                                                                                  | `auth/passwordPolicy.ts`, `shared/src/schemas/password.ts`                 |
|     |                                       | Session: signed JWT in `__Host-sid` (httpOnly, Secure, SameSite=Strict); 15-minute idle and 8-hour absolute limits; sign-out denylists the session; password change signs out the others | `server/src/lib/session.ts`, `auth/revokedSession.model.ts`                |
|     |                                       | One-time passwords force a password change before anything else works                                                                                                                    | `requireAuth()`                                                            |
|     |                                       | The browser warns 2 minutes before the idle timeout and signs out when it passes                                                                                                         | `web/src/app/IdleWatcher.tsx`                                              |
| A08 | Software or Data Integrity Failures   | Signed double-submit CSRF bound to the session; foreign `Origin` rejected                                                                                                                | `server/src/middleware/csrf.ts`                                            |
|     |                                       | `Idempotency-Key` on create endpoints: a retried request replays the first response instead of creating a duplicate                                                                      | `server/src/middleware/idempotency.ts`                                     |
|     |                                       | Optimistic concurrency: edits send the record `version`; a stale one gets 409 `stale_version`                                                                                            | services, `errorHandler.ts`                                                |
|     |                                       | Uploads: type decided by the file's first bytes (JPG, PNG, PDF only), 2 MB limit, random names outside the web root, served with `Content-Disposition` and a sandbox CSP                 | `server/src/lib/uploads.ts`                                                |
| A09 | Security Logging & Alerting Failures  | pino structured logs (method, URL, status, request id only); credentials and PII redacted                                                                                                | `server/src/lib/logger.ts`, `app.ts`                                       |
|     |                                       | Append-only audit log: sign-ins, failures, lockouts, access denied, PII reveals, exports, data changes (field by field) and admin changes                                                | `lib/audit.ts`, Customer 360 › Audit log                                   |
| A10 | Mishandling of Exceptional Conditions | RFC 9457 problem+json for every error, with a request id; unexpected errors answer a generic 500 and are logged in full                                                                  | `server/src/middleware/errorHandler.ts`                                    |
|     |                                       | Fail closed: unhandled rejections exit the process; graceful shutdown; React Suspense fallbacks per route                                                                                | `server/src/index.ts`, `web/src/app/AppShell.tsx`                          |

## What you can test

### Baseline (no sign-in needed)

| Scenario                                                                       | Expected                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `GET /api/v1/health`                                                           | 200, CSP and nosniff headers, no `X-Powered-By`                |
| `GET /api/v1/ready` with MongoDB stopped                                       | 503, `checks.database: "down"`                                 |
| `GET /api/v1/nope`                                                             | 404 `application/problem+json` with `requestId` and `instance` |
| `X-Request-Id: my-test-id-001`                                                 | Echoed back; unsafe values are replaced                        |
| `POST` without `X-CSRF-Token`, with a forged token, or another session's token | 403 `csrf_invalid`                                             |
| `POST` with a valid token but `Origin: https://evil.example`                   | 403 `origin_not_allowed`                                       |
| `?status[$ne]=x`, `{"cif": {"$ne": null}}`, unknown query field                | 400                                                            |
| Malformed JSON / body over 100 KB                                              | 400 / 413                                                      |

### Signed in

| Scenario                                                    | Expected                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Wrong password for a real ID vs a made-up ID                | Same 401 body (`invalid_credentials`, same `attemptsLeft`)           |
| 5 wrong passwords                                           | 401 `account_locked`, even with the right password afterwards        |
| Sign out, then replay the old cookie                        | 401                                                                  |
| One-time password user calls any API except `/auth/*`       | 403 `password_change_required`                                       |
| New password `password12345` or one containing the staff ID | 400 `passwordBreached` / `passwordContainsId`                        |
| `csr001` calls `/api/v1/admin/users`                        | 404                                                                  |
| `csr001` searches customers                                 | Only branch 0001; mobiles masked `+91 98450 •••• 45`                 |
| `csr001` opens a branch 0004 customer                       | 404                                                                  |
| `csr001` calls `POST /customers/CIF-000124/reveal-id`       | 403; as `sup001`: 200 and an audit entry                             |
| Admin sets `maxPageSize` to 10, user asks for `pageSize=50` | `pageSize: 10` in the response                                       |
| Admin switches off Request board                            | It leaves the menu; its API returns 403                              |
| Admin switches off Users & access, or demotes themselves    | 409 `self_protection`                                                |
| CSR requests a block, then tries to approve it              | 403; a supervisor's approval blocks the customer                     |
| Supervisor approves their own request                       | 403 `own_request`                                                    |
| Same `Idempotency-Key` sent twice                           | One request created; second response has `Idempotent-Replayed: true` |
| Move a request open → closed                                | 409 `invalid_transition`                                             |
| Resolve without notes                                       | 400 `resolutionRequired`                                             |
| Send an old `version`                                       | 409 `stale_version`                                                  |
| CSR closes a resolved request                               | 403; a supervisor can                                                |
| Upload an `.exe` renamed to `.png`                          | 400 "This file type isn't accepted"                                  |

With curl (the dev cert is self-signed, hence `-k`):

```bash
curl -sk -c jar.txt https://localhost:4001/api/v1/auth/csrf          # saves the cookie, prints the token
curl -sk -b jar.txt -c jar.txt -X POST https://localhost:4001/api/v1/auth/login \
  -H "X-CSRF-Token: <token>" -H "Content-Type: application/json" \
  -d '{"staffId":"csr001","password":"Namma-Bengaluru-2026"}'         # returns a new csrfToken for the session
curl -sk -b jar.txt "https://localhost:4001/api/v1/customers?name=rao&pageSize=5"
```

## Deliberate choices

- **Aadhaar is never collected.** Storing Aadhaar numbers is restricted, so the ID types are passport, PAN, voter ID and driving licence.
- **Rejected, not silently cleaned.** Requests with operator keys or unknown fields fail loudly, so testers can see the control working.
- **Sign-out ends one session.** Parallel test runs with the same user don't sign each other out; password changes and deactivation end every session.
- **Lockout needs an admin.** There's no automatic unlock timer, so lockout tests are deterministic; admins unlock from Users & access.
