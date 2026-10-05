# Security controls

How CSM Playground addresses the **OWASP Top 10 (2025)**, where each control lives in the code, and what you can test. Controls marked _(phase N)_ are designed and arrive with that phase.

## Threat model in brief

| Asset                                      | Threat                                           | Main controls                                                 |
| ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| Customer PII (ID numbers, mobiles, emails) | Disclosure through the API, logs or the database | Field encryption, masking without `viewPII`, log redaction    |
| Staff accounts                             | Password guessing, session theft                 | bcrypt, lockout, rate limits, httpOnly SameSite cookies       |
| Customer status (block / activate)         | One person abusing access                        | Maker-checker approvals, audit log                            |
| Screen and role configuration              | Privilege escalation                             | Admin-only screens enforced on the server, 404 for non-admins |
| The API itself                             | Injection, CSRF, flooding                        | zod validation, operator rejection, CSRF tokens, rate limits  |

## OWASP Top 10 (2025) mapping

| #   | Risk                                  | Control                                                                                                                                                              | Where                                                                |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A01 | Broken Access Control                 | Effective permissions = role grants + per-user grants − revokes, only on enabled screens; admin-only screens can never be granted to non-admins                      | `shared/src/permissions.ts` (`resolvePermissions`)                   |
|     |                                       | `requireCapability` on every route, branch-scoped data, admin APIs answer 404 to non-admins _(phase 2–3)_                                                            | `server/src/middleware/`                                             |
|     |                                       | CORS allowlist with credentials                                                                                                                                      | `server/src/app.ts`                                                  |
| A02 | Security Misconfiguration             | Strict CSP (`script-src 'self'`, `frame-ancestors 'none'`), nosniff, `Referrer-Policy: no-referrer`, no `X-Powered-By`                                               | `server/src/app.ts` (helmet)                                         |
|     |                                       | HSTS in production only (on `localhost` it would force HTTPS on every other local app)                                                                               | `server/src/app.ts`                                                  |
|     |                                       | Config validated at startup; refuses missing, short or `change-me` secrets; errors never print values                                                                | `server/src/config.ts`                                               |
|     |                                       | `Cache-Control: no-store` on all API responses                                                                                                                       | `server/src/app.ts`                                                  |
| A03 | Software Supply Chain Failures        | Exact versions (`save-exact`), committed lockfile, `npm ci` in setup, `npm audit` in `npm run check`, Dependabot                                                     | `.npmrc`, `scripts/setup.*`, `.github/dependabot.yml`                |
| A04 | Cryptographic Failures                | Passwords: bcrypt cost 12                                                                                                                                            | `server/src/lib/password.ts`                                         |
|     |                                       | ID numbers: AES-256-GCM (random IV, auth tag) plus a keyed HMAC blind index for exact search; never returned by the API                                              | `server/src/lib/crypto.ts`, `customer.model.ts`                      |
|     |                                       | PII masking helpers for callers without `viewPII`                                                                                                                    | `shared/src/mask.ts`                                                 |
|     |                                       | HTTPS everywhere in dev (self-signed cert) so `Secure` cookies work; secrets only in `server/.env` (gitignored, mode 600)                                            | `scripts/setup.*`                                                    |
| A05 | Injection                             | Requests with `$`-prefixed or dotted keys (body, query, params) are rejected with 400                                                                                | `server/src/middleware/rejectOperators.ts`                           |
|     |                                       | Mongoose `strictQuery` and `sanitizeFilter`; the "simple" query parser (no nested objects from `?a[b]=`)                                                             | `server/src/db.ts`, `server/src/app.ts`                              |
|     |                                       | zod strict schemas on every input; sort fields whitelisted; search text length-capped                                                                                | `server/src/lib/validate.ts`, `pagination.ts`, `shared/src/schemas/` |
|     |                                       | ESLint bans `eval`, `new Function` and `dangerouslySetInnerHTML`                                                                                                     | `eslint.config.js`                                                   |
|     |                                       | CSV export guards against formula injection _(phase 5)_                                                                                                              |                                                                      |
| A06 | Insecure Design                       | Maker-checker approvals for activation and blocking                                                                                                                  | `approval.model.ts` _(flows in phase 5)_                             |
|     |                                       | Service-request state machine; closing needs `approve`                                                                                                               | `shared/src/enums.ts` (`SR_TRANSITIONS`)                             |
|     |                                       | Rate limits per route class (600/min API, 20 per 15 min for sign-in per IP + staff ID)                                                                               | `server/src/middleware/rateLimit.ts`                                 |
| A07 | Authentication Failures               | Password policy: 12–128 characters, no composition rules (NIST 800-63B)                                                                                              | `shared/src/schemas/password.ts`                                     |
|     |                                       | Lockout after 5 failures, breached-password check, idle timeout, session revocation via `tokenVersion`, forced change of one-time passwords _(phase 2)_              | `staffUser.model.ts` fields are in place                             |
| A08 | Software or Data Integrity Failures   | Signed double-submit CSRF: `__Host-csrf` cookie (Secure, SameSite=Strict) must match `X-CSRF-Token`, and its HMAC is bound to the session; foreign `Origin` rejected | `server/src/middleware/csrf.ts`                                      |
|     |                                       | Optimistic concurrency (`optimisticConcurrency`) → 409 on conflicting edits                                                                                          | models, `errorHandler.ts`                                            |
|     |                                       | Uploads checked by content, random names, stored outside the web root _(phase 4)_                                                                                    |                                                                      |
| A09 | Security Logging & Alerting Failures  | pino structured logs with request ids; cookies, tokens, passwords and ID numbers are redacted                                                                        | `server/src/lib/logger.ts`                                           |
|     |                                       | Append-only audit log for data changes, security events and admin changes                                                                                            | `auditLog.model.ts`, `server/src/lib/audit.ts`                       |
| A10 | Mishandling of Exceptional Conditions | Every error is RFC 9457 problem+json with a request id; unexpected errors answer a generic 500 and are logged in full                                                | `server/src/middleware/errorHandler.ts`                              |
|     |                                       | Express 5 forwards async errors; `unhandledRejection` and `uncaughtException` log and exit; graceful shutdown on SIGINT/SIGTERM                                      | `server/src/index.ts`                                                |

## What you can test today

All of these are covered by `server/test/app.test.ts`, and make good first API tests to write yourself:

| Scenario                                                     | Expected                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `GET /api/v1/health`                                         | 200, `{"status":"ok"}`, CSP and nosniff headers, no `X-Powered-By` |
| `GET /api/v1/ready` with MongoDB stopped                     | 503, `checks.database: "down"`                                     |
| `GET /api/v1/nope`                                           | 404 `application/problem+json` with `requestId` and `instance`     |
| `X-Request-Id: my-test-id-001`                               | Echoed back; unsafe values are replaced                            |
| `POST` anything without `X-CSRF-Token`                       | 403                                                                |
| `POST` with a token from another session, or a forged one    | 403                                                                |
| `POST` with a valid token but `Origin: https://evil.example` | 403                                                                |
| `GET /api/v1/health?cif[$ne]=x`                              | 400                                                                |
| `POST` body `{"cif": {"$ne": null}}`                         | 400                                                                |
| Malformed JSON / body over 100 KB                            | 400 / 413                                                          |
| More than 600 requests in a minute                           | 429 with `RateLimit` headers                                       |

With curl (the dev cert is self-signed, hence `-k`):

```bash
curl -sk -c jar.txt https://localhost:4001/api/v1/auth/csrf        # saves the cookie, prints the token
curl -sk -b jar.txt -X POST https://localhost:4001/api/v1/anything \
  -H "X-CSRF-Token: <token>" -H "Content-Type: application/json" -d '{}'   # 404: CSRF passed
```

## Deliberate choices

- **Aadhaar is never collected.** Storing Aadhaar numbers is restricted, so the ID types are passport, PAN, voter ID and driving licence.
- **Request ids are validated.** A caller-supplied `X-Request-Id` is only used if it matches `[A-Za-z0-9-]{8,64}`, so it can't inject into logs.
- **Rejected, not silently cleaned.** Requests with operator keys fail loudly, so testers can see the control working.
