# CSM Playground

A core-banking Customer Service Management app for practising UI and API test automation:
React SPA (`web`, Vite, https://localhost:3001), Express 5 + MongoDB API (`server`,
https://localhost:4001) and shared zod schemas/permissions (`shared`). `npm run setup` installs
everything; `npm run start:all` starts it. Architecture: `docs/architecture.md`. The plan for the
practice UI elements being added: `docs/plans/ui-elements-plan.md`.

## Project layout

| Where                               | What                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `shared/src/`                       | Schemas, enums, `permissions.ts` (screens, roles), masking and input-mask helpers          |
| `server/src/modules/<area>/`        | `routes.ts` (HTTP only) · `service.ts` (rules) · `*.model.ts` (Mongoose)                   |
| `server/src/fixtures/`              | Fixed data behind mocks (e.g. `ocr.ts`, matched by sha256 of the sample images)            |
| `web/src/modules/<area>/`           | `<Area>Page.tsx` (layout), one file per panel/dialog, `api.ts` for the area's API calls    |
| `web/src/components/`               | Existing building blocks (`Field`, `Overlay`, `Widgets`, …) plus the groups below          |
| `web/src/components/inputs/`        | `NumberStepper`, `MaskedTextInput`, `OtpInput`, `ColourPicker`, `RichTextEditor`           |
| `web/src/components/selection/`     | `MultiSelect`, `ChipSelect`, `StarRadio`/`StarSlider`/`StarDisplay`, `TreeCheckbox`        |
| `web/src/components/overlays/`      | `ContextMenu`, `MenuWithSubmenu`, `HoverCard`, `InfoTip`, `Snackbar`, `CommandPalette`     |
| `web/src/components/data/`          | `Chart`, `VirtualList`, `Skeleton`, `Progress`, `ResizablePanels`, `BackToTop`             |
| `web/src/components/media/`         | `SafeImage`, `VideoPlayer`, `Carousel`, `SignaturePad`, `CameraCapture`                    |
| `web/src/components/webcomponents/` | `<csm-gauge>`, `<csm-bureau-score>` (open shadow), `<csm-pin-pad>` (closed shadow)         |
| `web/src/hooks/`                    | `useUrlNumber` (`?delay=` etc.), `useUnsavedGuard`, `useClipboard`, `useEventSource`, …    |
| `web/src/locales/{en,kn}/`          | One JSON namespace per area; shared component text is in `ui.json`                         |
| `testresources/`                    | Sample files testers upload (OCR images, spreadsheets, media), copied from test-playground |

Each component group has its own CSS file next to it; `styles/app.css` holds the design tokens
and the existing app styles.

### Adding things

- **A screen:** add it to `SCREENS` and the role grants in `shared/src/permissions.ts`, the route
  in `web/src/router.tsx`, a `locales/en/<area>.json` (and an empty `{}` `kn` file until Kannada
  is filled in), seed data, and its user-guide entries.
- **A practice element:** give it one locator style from plan §3 and show it with
  `<LocatorBadge style="…" />` (visible only with `?hints=1`). Existing screens keep the
  `data-testid` contract; new elements deliberately don't all have one.
- **Shared components** never add `data-testid` themselves. Callers choose the locator via
  `id`, `name`, `inputProps` or `data-*`.
- **Text:** never hard-code UI text. English goes into `locales/en/*.json` now; Kannada is
  filled in Phase 9 (until then `kn` falls back to English).
- **Timers** a test may need to pin read a URL parameter through `useUrlNumber` (ignored in
  production). List them in the page's file header.
- **Shadow DOM styles** use constructed stylesheets (`webcomponents/sheet.ts`): the CSP
  (`style-src 'self'`) blocks `<style>` inside shadow roots.
- **Security headers** (`server/src/app.ts`) are relaxed only for the feature that needs it, with
  a test in `server/test/app.test.ts`.

### Checks

`npm run check` runs lint, format check, typecheck, tests and the dependency audit. Server
integration tests skip when MongoDB isn't running. The web app has no automated UI tests: after a
change, open the affected screens in the browser and check the console.

## Code comments

Same rules as test-playground:

1. **File header:** 1–3 lines at the top of every `.ts`/`.tsx` file, saying what the file is for
   and anything a newcomer would trip on (served from another port, `?delay=` controls timing, …).
2. **JSDoc** on every exported or top-level function, component, hook and class. Always a
   description; `@param`/`@returns` on utilities and server helpers, and on components only when a
   prop isn't obvious.
3. **Route handlers** get the route signature: `// POST /otp/verify { code }`.
4. **Inline `//`** only where a reader would ask "why?": magic numbers, browser quirks, security
   reasons, and anything that would break if "simplified".

Not allowed: comments that restate the code, history notes, commented-out code, TODOs without a reason.
