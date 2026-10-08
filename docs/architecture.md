# Architecture

## Workspaces

| Package                  | Role                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared` (`@csm/shared`) | Code both sides need: zod schemas, enums, screen and role definitions, the permission resolver, masking. Imported as TypeScript source; no build step. |
| `server` (`@csm/server`) | Express 5 API, run with `tsx`.                                                                                                                         |
| `web` (`@csm/web`)       | React SPA built with Vite. In production the API serves the built files.                                                                               |

## Server layers

Each area lives in `server/src/modules/<area>/`:

```
routes.ts      HTTP only: paths, the capability each route needs, validation, status codes
service.ts     business rules: branch scope, state transitions, maker-checker, audit entries, queries
dto.ts         what the API returns (masking PII), where a module has more than one shape
*.model.ts     Mongoose schema and indexes
```

Rules live in services only, so the same rule applies whichever route calls it. The modules are small enough that queries stay in the services; a separate repository layer can be split out when a module grows. Cross-cutting pieces sit in `lib/` (crypto, sessions, pagination, uploads, CSV, audit, errors) and `middleware/` (auth, CSRF, rate limits, idempotency).

## Web app

```
app/          AuthProvider (/auth/me, refreshed every 30 s), useCan / useAction, AppShell, IdleWatcher, guards
components/   form fields and the locator contract, dialogs, drawer, toasts, tabs, stepper, pagination, typeahead
modules/      one folder per area; each route is a lazy-loaded chunk
locales/      en/ and kn/, one JSON per module, loaded on first use
```

Server state lives in TanStack Query (caching, page-number and infinite queries, request cancellation). Forms use react-hook-form with the same zod schemas the API uses; validation messages are codes translated per language.

## Request pipeline

```
request id → logging → security headers → CORS → rate limit → no-store
  → JSON body (100 KB max) → cookies → reject $/dotted keys → load session → CSRF
  → routes (capability → validate → service) → 404 → problem+json error handler
```

## Data

| Collection                      | Notes                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `staffusers`                    | Role, per-user overrides, lockout counters, `tokenVersion` / `permVersion` for revoking sessions and refreshing menus |
| `roles`, `screens`              | Seeded from `shared/src/permissions.ts`; admins edit them later (seed never overwrites)                               |
| `customers`                     | Encrypted ID number + blind index; `nameSearch` for prefix search; optimistic concurrency                             |
| `servicerequests`, `srcomments` | Comments are separate so they can be cursor-paginated                                                                 |
| `approvals`                     | Maker-checker requests                                                                                                |
| `auditlogs`                     | Append-only; data, security and admin events                                                                          |
| `accounts`                      | Deposit accounts (`0001 10 000123`: branch, type, number); balance in paise, never negative                           |
| `transactions`                  | Cash deposits and withdrawals; `pending_authorisation` until a supervisor decides                                     |
| `drawers`                       | One per teller per business day (IST): float, cash in/out, physical count, variance, sign-off                         |
| `counters`                      | Atomic sequences for `CIF-000124`, `SR-2026-000031`, `TXN-2026-000001`, account and draft numbers                     |
| `lookups`                       | Dropdown values with English and Kannada labels; `parent` links dependent lists                                       |

Seeded `_id`s carry the record's original creation time, so newest-first cursor paging (`_id < cursor`) matches creation order.

### Moving money without multi-document transactions

The local MongoDB is standalone, so it has no multi-document transactions. A cash posting changes two documents (the account and the teller's drawer) with conditional atomic updates instead:

1. Withdrawal: `$inc` the balance down only where `balance >= amount`, then `$inc` the drawer's `cashOut` only where it is open and holds enough cash (`$expr`). Deposit: the drawer first (stays under its ₹5,00,000 limit), then the account (still active).
2. If the second update matches nothing, the first is reversed and the request fails with a 409 and a `code` (`insufficient_funds`, `insufficient_cash`, `drawer_limit`, `account_not_active`).
3. Authorising a held withdrawal first flips it to `posted` with a conditional update, so two supervisors can't both pay it out; if the money can't move, the status flips back.

Closing a drawer matches on its `cashIn`/`cashOut` as well as its version, so a transaction posted at the same moment makes the close fail as stale instead of being left out of the count. All amounts are integer paise.

## Pagination

- **Offset** (`?page=&pageSize=&sort=`) for tables; `pageSize` is capped by the screen's `maxPageSize`; responses are `{ items, page, pageSize, total }`.
- **Cursor** (`?cursor=&limit=`) for feeds that only grow; responses are `{ items, nextCursor }`.
- Sort fields are whitelisted per endpoint, with `_id` as a tie-breaker so pages never overlap.

Helpers: `server/src/lib/pagination.ts`, schemas: `shared/src/schemas/common.ts`.

## Permissions

`resolvePermissions(roleKey, roleGrants, overrides, screens)` in `shared` computes what a user can do. The server enforces it on every route; the web app uses the same result to build the menu and hide or disable actions. The UI is never the security boundary.
