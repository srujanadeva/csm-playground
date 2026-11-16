# Plan: practice UI elements inside the banking app

Status: **in progress** (Phase 0 done) · Last updated: 2026-11-16

This plan adds the UI elements the app is missing, so testers can practise automating them.
Every element is built into a real banking flow, such as KYC, teller, service requests or
admin. None of them sit on a demo page.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Not in scope:** English/Arabic RTL toggle, image CAPTCHA, "I'm not a robot" CAPTCHA.                                                                                                                                                                                                      |
| D2  | **Dropped** because they have no use in a bank: moving-target button, 3-level nested iframes, focus/blur event log, a stand-alone alert/confirm/prompt test page. (Native `alert`/`confirm`/`prompt` still appear in Admin, where a real action needs them; see Phase 7.)                   |
| D3  | **OCR is a predictable mock.** Each sample ID image is matched by its sha256 to fixed fields and confidence scores, the same way test-playground's `server/fixtures/ocr.js` works.                                                                                                          |
| D4  | **SheetJS** comes from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (the build test-playground uses). It runs **on the server only**. Uploads are kept in memory with multer, and the server checks the file signature, unzipped size, and sheet/row/column limits before reading. |
| D5  | **Locators are deliberately imperfect, on new elements only.** Existing screens keep their `data-testid` contract. New elements each use a different locator style; see §3.                                                                                                                 |
| D6  | **One persona-based user guide**, in two places: `docs/user-guide.md` and an in-app Help centre. Both are generated from the same source; see §5.                                                                                                                                           |
| D7  | The pet-store CRUD from the original list is rebuilt as **bank product cards**: same mechanics, banking content.                                                                                                                                                                            |
| D8  | **Sample files are reused from test-playground** (spreadsheets, `testvideo.mp4`, `testimage.jpg`, OCR images); banking-specific files are added only where none fits.                                                                                                                       |
| D9  | **English first.** New text goes into `en` locale files during each phase; Kannada (`kn`) is filled in Phase 9. Until then `kn` falls back to English.                                                                                                                                      |
| D10 | **One commit per phase, on `main`.**                                                                                                                                                                                                                                                        |

## 2. Code layout (following test-playground)

Test-playground keeps each feature in its own folder (page, sub-components, `api`, strings),
has one server route file per feature, keeps sample files in `testresources/` and fixed
fake results in `server/fixtures/`, and lets URL parameters control timers. We follow
the same layout, written in csm-playground's TypeScript and its routes/service/model
layers.

```
web/src/
  components/                  shared building blocks, grouped like test-playground's playground groups
    inputs/                    NumberStepper, MaskedInput (phone/card/amount), OtpInput, ColourPicker, RichTextEditor
    selection/                 MultiSelect, ChipSelect, StarRating, TreeCheckbox
    overlays/                  ContextMenu, MenuWithSubmenu, HoverCard, InfoTip, Snackbar, CommandPalette
    data/                      Chart, VirtualList, Skeleton, Progress, ResizablePanels, BackToTop
    media/                     VideoPlayer, SafeImage, Carousel, SignaturePad, CameraCapture
    webcomponents/             csm-bureau-score (open shadow, nested + slot), csm-pin-pad (closed shadow)
    (existing files stay where they are)
  hooks/                       useUnsavedGuard, useUrlNumber (?delay= etc.), useEventSource, useClipboard
  modules/<feature>/
    <Feature>Page.tsx          the route component; layout only
    <Part>.tsx                 one file per panel/dialog, each under ~350 lines
    api.ts                     the feature's API calls and query keys
  modules/help/guide/          the user guide data (see §5)
  locales/{en,kn}/<feature>.json

server/src/
  modules/<feature>/           routes.ts · service.ts · *.model.ts (existing pattern)
  fixtures/                    ocr.ts, bureau.ts, products.ts: fixed data for mocks
  mock-providers/              e-KYC and credit-bureau pages served on a second port (cross-origin)

testresources/                 sample files testers upload; also downloadable from the Help centre
  ocr/                         id-clean.png, id-blurry.png, id-partial.png (banking-themed)
  imports/                     customers.xlsx (2 sheets), leads.csv, messy-headers.xlsx, corrupt.xlsx,
                               too-many-rows.csv, headers-only.csv, renamed-image.xlsx
  media/                       selfie.jpg, training.mp4, specimen-signature.png
```

**Comments.** Use the test-playground rules: every file starts with a 1–3 line header, every
exported function or component has JSDoc, Express handlers get a `// POST /path { body }`
line, and nothing restates the code.

**Timers controlled by URL.** For example `?delay=0`, `?bureauDelay=`, `?feedInterval=`,
`?otpTtl=`, `?stallAt=`. They work only outside production, and each page's file header
lists the ones it accepts.

**Adding a screen.** Add it to `SCREENS` and the role grants in `shared/src/permissions.ts`,
then the route in `router.tsx`, the locale files, the seed data, and a guide entry. A new
`CLAUDE.md` section "Adding things" will record these steps, as test-playground's does.

## 3. Locator strategy (new elements only)

Each element is given **one main locator style**, so the app as a whole covers every way a
tester finds elements. Some are **deliberately awkward**, as in a real legacy app.

| Code | Style                  | What testers get                                                                                      |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| TID  | `data-testid`          | Clean, stable (used sparingly on new work)                                                            |
| ID   | `id`                   | Stable id, no testid                                                                                  |
| NAME | `name`                 | Form fields only reachable by `name=`                                                                 |
| CLS  | class only             | Shared classes (`.btn.btn-sm`); needs a parent or `nth` to tell elements apart                        |
| TXT  | visible text only      | `getByText` / `//button[text()='…']`; changes with language                                           |
| ARIA | role + accessible name | `getByRole('slider', { name: … })`                                                                    |
| LBL  | label / placeholder    | `getByLabel`, `getByPlaceholder`                                                                      |
| TTL  | `title` attribute      | Icon-only buttons with only a tooltip title                                                           |
| DATA | other `data-*`         | `data-qa`, `data-row-key`, `data-col`: not the house convention                                       |
| DYN  | dynamic id             | `id="otp-7f3a9c-2"` changes on every render; needs `starts-with` / `contains`                         |
| DUP  | duplicate id/text      | Same button text or the same id in two panels; must be narrowed by a parent element                   |
| XP   | XPath-only             | No useful attributes: reach it with `following-sibling`, `ancestor`, or by column position in a table |
| CTX  | context switch         | Inside an iframe or a shadow root: switch frame / pierce shadow first                                 |

These are assigned per element in the table in §4. Every element still has an
accessible name (labels, roles) so screen readers work. Locators are made awkward only by
leaving out test hooks, never by breaking accessibility.

Each new screen section shows a **locator badge** (as test-playground's `SectionHeader`
does). The badge is off by default and appears with `?hints=1`, so a tester can practise
without it.

## 4. Phases

Each phase is in a working, shippable state when it ends. Each phase checklist ends with:
`npm run check` passes, server integration tests for the new routes, locale keys in **en**
(kn in Phase 9), guide entries for its flows (§5), and the README screen table updated.

### Phase 0 — Shared foundations (no new screens)

**Step 0.1 – Tooling.** Add the `?param` timer hook, the `?hints=1` locator badge, the
`testresources/` folder with its sample files, the server `fixtures/` folder, and a
`CLAUDE.md` with layout and comment rules.

**Step 0.2 – Components.** Build the components in §2. Each one is used at least once in
the later phases.

**Step 0.3 – Security headers.** Extend the policy in `server/src/app.ts` only as each
phase needs it:

- `frame-src` for the mock-provider origin and Google Maps
- `media-src 'self' blob:`
- `Permissions-Policy: camera=(self), geolocation=(self), fullscreen=(self)`
- the mock-provider port sets its own `frame-ancestors` to allow the app

Every relaxation gets a test in `server/test/app.test.ts`. Phase 0 itself needs none (the
shadow-DOM components use constructed stylesheets, which `style-src 'self'` allows); the first
change lands with the camera and e-KYC frame in Phase 2.

**Step 0.4 – Undo snackbar and skeletons.** Use `Snackbar` with Undo for actions that can be
reversed. Replace the first-load spinners on the Dashboard and Customer 360 with `Skeleton`.

### Phase 1 — Sign-in, access and app chrome

| Element                         | Banking feature                                                                                             | Locator |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------- |
| Forgot-password form            | `/forgot-password`: staff ID → OTP → new password                                                           | LBL     |
| Six-box OTP input               | Code sent to the dev inbox; paste fills all boxes; resend countdown; expiry                                 | DYN     |
| Dev inbox                       | `/dev/inbox` (outside production only): the SMS/e-mail messages the app "sent"                              | XP      |
| Sign-up form + terms checkboxes | `/request-access`: new staff request access. Creates an approval for an admin. Terms and privacy checkboxes | NAME    |
| Blocking cookie-consent banner  | Login page cannot be used until the user accepts or rejects analytics; the choice is stored                 | TXT     |
| Announcement bar                | Top of the app shell, dismissible, fed by Admin → Announcements (Phase 7)                                   | CLS     |
| Collapsible nested sidebar      | Nav groups collapse and remember their state; Accounts has nested sub-groups                                | ARIA    |
| Collapsible "Pages" group       | Holds Help centre and Branch locator                                                                        | TXT     |
| Command palette (Ctrl/⌘+K)      | Jump to any screen the user may open, or look up a CIF                                                      | ARIA    |
| Breadcrumbs (extend)            | Earlier parts of the trail become clickable links                                                           | XP      |

Server: new `notifications` module (outbox + dev inbox), `otp` service (hashed codes, TTL,
attempt limit, rate limit), `accessRequests` hooked into `approvals`.

### Phase 2 — Onboarding and KYC

| Element                                 | Banking feature                                                                                                  | Locator |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------- |
| ID-card OCR, low-confidence flags       | KYC step: upload ID → fields filled from fixtures; fields under 0.8 confidence are flagged and must be confirmed | DATA    |
| Camera selfie + upload fallback         | KYC step: live photo; if permission is denied or there is no camera, upload a file instead                       | TTL     |
| Canvas signature pad                    | Review step: customer signs; clear/undo; empty-signature check; saved as a PNG document                          | ID      |
| Cross-origin iframe + `postMessage`     | "Verify with e-KYC" opens the mock provider (second port); result is sent back, sender's origin checked          | CTX     |
| Unsaved-changes guard                   | Wizard, Edit customer drawer, New request: block in-app navigation, plus browser warning on refresh/close        | TXT     |
| Masked phone input                      | `98765 43210` with the +91 prefix                                                                                | NAME    |
| Image that loads / broken with fallback | Customer photo; a missing photo falls back to initials                                                           | CLS     |
| Conditionally revealed fields (extend)  | Nominee details appear when "Add nominee" is checked                                                             | XP      |

### Phase 3 — Customer search and Customer 360

| Element                         | Banking feature                                                                                     | Locator |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ------- |
| Double-click target             | Double-click a search row → opens Customer 360                                                      | DATA    |
| Right-click custom context menu | Row menu: Open, Copy CIF, New request, Request block                                                | TXT     |
| Dropdown menu with submenu      | 360 "Actions" → Create request ▸ categories                                                         | ARIA    |
| Hover card with tooltip         | Hover a CIF or staff name → mini profile card                                                       | TTL     |
| Copy + paste check              | Copy account number; a re-entry field reports whether it was pasted or typed and whether it matches | ID      |
| Shadow DOM (nested + slot)      | `<csm-bureau-score>` credit-score web component containing a slotted `<csm-gauge>`                  | CTX     |
| Late-loading iframe             | Bureau report iframe added after `?bureauDelay=` (default 4 s)                                      | CTX     |
| Delayed-loading widget          | Bureau score panel: skeleton → value, or an error with Retry                                        | DATA    |
| Promo banner                    | Cross-sell offer based on the customer's eligible products                                          | CLS     |
| Info tips on section headers    | ⓘ on the KYC, Risk and SLA headers                                                                  | ARIA    |
| Back-to-top button              | Long Transactions and Activity tabs                                                                 | TTL     |

### Phase 4 — Service requests

| Element                                        | Banking feature                                                                                       | Locator |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| Multi-select dropdown                          | Board filter: several statuses and categories at once                                                 | ARIA    |
| Multi-select with chips                        | Request tags (e.g. `VIP`, `Escalated`, `Branch-visit`)                                                | DUP     |
| Time and date-time pickers                     | Schedule a callback (`datetime-local`), preferred call window (`time`)                                | NAME    |
| Rich text editor                               | Resolution notes (the server cleans the HTML)                                                         | ID      |
| Star ratings: radio / half-star / read-only    | CSAT on resolve (radio stars); supervisor quality score (half-star slider); read-only on board        | XP      |
| Sortable table + inline edit + expandable rows | List view: expand a row for description and latest comment; edit priority/assignee inline (Enter/Esc) | XP      |
| Resizable panels                               | Split view: list \| detail, with a drag handle and keyboard arrows                                    | CLS     |
| Full-screen mode                               | "Present" the Kanban board                                                                            | TTL     |
| Notification permission prompt                 | Desktop alerts for SLA breach or new assignment                                                       | TXT     |
| Drag-and-drop (extend)                         | Kanban drag already exists; add a keyboard alternative                                                | —       |

### Phase 5 — Teller

| Element                            | Banking feature                                                                | Locator |
| ---------------------------------- | ------------------------------------------------------------------------------ | ------- |
| Click counter buttons              | Token queue: "Call next", "Recall", "Skip" with per-button counts              | CLS     |
| Full-screen (2nd use)              | Lobby token display                                                            | ID      |
| Number stepper                     | −/+ on each denomination row of the cash count                                 | DUP     |
| Masked amount                      | `₹1,23,456.00` with Indian digit grouping on deposits and withdrawals          | LBL     |
| OTP step-up (2nd use of OTP input) | Withdrawals over the limit need the customer's OTP (from the dev inbox)        | DYN     |
| Signature verification (image)     | Specimen signature shown next to the slip, with a "Signature matches" checkbox | XP      |
| Live order feed                    | Branch activity feed over SSE (`?feedInterval=`)                               | DATA    |
| Re-rendered rows (stale elements)  | Every N seconds the feed rebuilds every row with new keys                      | XP      |
| Countdown timer (2nd use)          | Time left before drawer close (cut-off)                                        | ID      |
| Dynamic buttons (extend)           | "Post" button: loading → posted, and it disappears for pending authorisations  | TXT     |

### Phase 6 — Accounts and Cards (turn on the placeholder screens)

| Element                                  | Banking feature                                                                                       | Locator |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------- |
| Product cards: create/read/update/delete | Product catalogue (savings, FD, RD, loans): create, edit, retire                                      | DATA    |
| Add/edit form modal                      | Product form (rate, tenure, min balance)                                                              | NAME    |
| Status filter                            | Active / Draft / Retired                                                                              | TXT     |
| Stat tiles                               | Products by status, average rate                                                                      | CLS     |
| Expandable overlay cards                 | A product card expands into an overlay with full terms                                                | XP      |
| Colour picker with swatches + hex        | Product badge colour                                                                                  | ID      |
| Masked card input                        | Card lookup `4111 1111 1111 1111`, shown masked after lookup                                          | NAME    |
| Closed shadow root                       | `<csm-pin-pad>` keypad for card PIN change (closed shadow; reachable only by keyboard or coordinates) | CTX     |
| Toggle switches (2nd use)                | Card controls: online, international, contactless                                                     | ARIA    |
| Lazy-loaded image                        | Product card artwork                                                                                  | CLS     |

### Phase 7 — Dashboard and Admin

| Element                                                  | Banking feature                                                                                                         | Locator |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| Chart with hover tooltips                                | Request trend and SLA met/breached; values appear only in tooltips                                                      | DATA    |
| Sortable grid                                            | Reorder dashboard tiles (mouse or keyboard); order saved per user                                                       | DUP     |
| Hero carousel                                            | Campaigns: previous/next, dots, pause/play, auto-advance (`?carouselInterval=`)                                         | ARIA    |
| Tree view with checkboxes                                | Role editor: screens ▸ capabilities, half-checked parents                                                               | XP      |
| Virtualised list                                         | Audit log viewer (more than 10,000 entries)                                                                             | DATA    |
| Excel/CSV upload + sheet picker + search + pages         | Bulk customer import: preview, check rows, then import                                                                  | ID      |
| Progress: determinate / stalled / failed / indeterminate | Import job: parsing (indeterminate) → importing (%) → stalled (`?stallAt=`) or failed                                   | ARIA    |
| Rich text + date-time + colour (2nd use)                 | Announcement editor: body, publish-at, bar colour                                                                       | LBL     |
| Native `confirm` / `prompt` / `alert`                    | Force sign-out of all sessions (`confirm`), type the staff ID to deactivate (`prompt`), clipboard unavailable (`alert`) | TXT     |
| Snackbar with Undo                                       | Undo after dismissing an announcement or archiving a product                                                            | CLS     |

### Phase 8 — "Pages" group: Help centre and Branch locator

| Element                        | Banking feature                                                             | Locator |
| ------------------------------ | --------------------------------------------------------------------------- | ------- |
| Help centre with persona guide | §5                                                                          | TID     |
| Accordion                      | FAQ                                                                         | ARIA    |
| Video: custom controls         | Training videos: play/pause/mute/seek                                       | TTL     |
| Broken video                   | A retired training video shows an error state                               | CLS     |
| Lazy-loaded video              | Videos further down the page load only when scrolled into view              | DATA    |
| Basic iframe                   | Embedded policy document                                                    | CTX     |
| Multiple iframes without ids   | Three product-explainer frames that look alike                              | CTX/XP  |
| Expand-button-only iframe card | Rate card frame that opens only from its Expand button                      | TXT     |
| Embedded Google map            | Branch locator map                                                          | CTX     |
| Geolocation permission prompt  | "Nearest branch" sorts the list by distance; a denied permission is handled | TXT     |

### Phase 9 — Hardening and docs

- Accessibility pass (axe) on every new screen, and a check that every key exists in both
  English and Kannada.
- Seed demo data for every feature: products, announcements, campaigns, bureau
  fixtures, a token queue, and audit history.
- README: one section per screen and a **Locator Quick Reference** table (element → screen
  → style → example selector/XPath), as in test-playground.
- Final review of the security-header exceptions (`docs/security.md`).

## 5. User guide by persona

**Who it's for:** the personas already in the app, plus visitors who are not signed in.

| Persona                 | Demo login | Guide covers                                                                                                    |
| ----------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| Visitor (not signed in) | —          | Cookie consent, request access, forgot password + OTP, dev inbox                                                |
| CSR                     | `csr001`   | Onboard with OCR, selfie, signature, e-KYC; search with context menu; Customer 360; create and resolve requests |
| Teller                  | `tel001`   | Token queue, deposit, withdrawal with OTP step-up and signature check, cash count, drawer close                 |
| Supervisor              | `sup001`   | Approvals, authorise withdrawals, sign off drawers, quality score, export, live feed                            |
| Admin                   | `admin001` | Users and access tree, announcements, products, bulk import, audit log, native dialogs                          |
| Everyone signed in      | any        | Command palette, notifications, Help centre, Branch locator, language                                           |

**Single source of truth.** Each flow is written once, as data, in
`web/src/modules/help/guide/` (TypeScript, with en/kn text in the `help` locale files). The
in-app page and `docs/user-guide.md` are both built from it, so they never drift
apart. The Markdown file is generated by `npm run guide:md`, and CI checks that it is
up to date.

**What each flow entry contains:**

- **Personas:** one or more.
- **Steps:** numbered, with menu paths.
- **Expected result.**
- **Try it link:** opens the right screen; if the current user's role cannot open it, the link says which demo login to use.
- **Sample files:** download links from `testresources/` (OCR images, import sheets).
- **Elements practised:** with their locator codes from §3.

**In-app Help centre** (`/help`, in the "Pages" group):

- Opens on the **signed-in user's persona**, with tabs for the other personas.
- Has a search box and the FAQ accordion.
- The login page links to the visitor flows.

## 6. Order and size

| Phase | Depends on | Relative size |
| ----- | ---------- | ------------- |
| 0     | —          | L             |
| 1     | 0          | M             |
| 2     | 0, 1 (OTP) | L             |
| 3     | 0          | M             |
| 4     | 0          | M             |
| 5     | 0, 1 (OTP) | M             |
| 6     | 0          | M             |
| 7     | 0, 1       | L             |
| 8     | 0          | M             |
| 9     | all        | S             |

The guide entries (§5) are written within each phase, not left until the end.
