# Architecture

## Workspaces

| Package                  | Role                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared` (`@csm/shared`) | Code both sides need: zod schemas, enums, screen and role definitions, the permission resolver, masking. Imported as TypeScript source; no build step. |
| `server` (`@csm/server`) | Express 5 API, run with `tsx`.                                                                                                                         |
| `web` (`@csm/web`)       | React SPA built with Vite. In production the API serves the built files.                                                                               |

## Server layers

Each area lives in `server/src/modules/<area>/` and follows the same layering as it grows:

```
routes.ts      HTTP only: paths, middleware (validate, requireCapability), status codes
controller.ts  maps the request to a service call and the result to a response
service.ts     business rules: permissions on records, state transitions, audit entries
repository.ts  database queries, projections, pagination
*.model.ts     Mongoose schema and indexes
```

Rules live in services only, so the same rule applies whichever route calls it. Cross-cutting pieces sit in `lib/` (crypto, pagination, audit, errors) and `middleware/`.

## Request pipeline

```
request id → logging → security headers → CORS → rate limit → no-store
  → JSON body (100 KB max) → cookies → reject $/dotted keys → CSRF
  → routes (validate → handler) → 404 → problem+json error handler
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
| `counters`                      | Atomic sequences for `CIF-000124`, `SR-2026-000031`, draft numbers                                                    |
| `lookups`                       | Dropdown values with English and Kannada labels; `parent` links dependent lists                                       |

Seeded `_id`s carry the record's original creation time, so newest-first cursor paging (`_id < cursor`) matches creation order.

## Pagination

- **Offset** (`?page=&pageSize=&sort=`) for tables; `pageSize` is capped by the screen's `maxPageSize`; responses are `{ items, page, pageSize, total }`.
- **Cursor** (`?cursor=&limit=`) for feeds that only grow; responses are `{ items, nextCursor }`.
- Sort fields are whitelisted per endpoint, with `_id` as a tie-breaker so pages never overlap.

Helpers: `server/src/lib/pagination.ts`, schemas: `shared/src/schemas/common.ts`.

## Permissions

`resolvePermissions(roleKey, roleGrants, overrides, screens)` in `shared` computes what a user can do. The server enforces it on every route; the web app uses the same result to build the menu and hide or disable actions. The UI is never the security boundary.
