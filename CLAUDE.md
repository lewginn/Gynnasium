# Gynnasium — notes for Claude

Personal gym tracker, installable web app first (Android Chrome is the main target), native wrapper (Capacitor) later.
The owner tests and signs off on PRs; Claude writes the code.

## Principles
- **Gym-floor first.** One-handed, sweaty, bad signal. Logging a set should take 1–2 taps. Tap targets ≥ 44px. Inputs use 16px font (no zoom on focus).
- **Local-first.** All reads/writes go to Dexie (`src/db/db.ts`). The network is never on the critical path. Supabase is for sync/backup only.
- **AI proposes, user approves.** AI output is a structured diff against plan rows, previewed before applying. Never write AI changes straight into plans.
- **Weights are stored in kg** (`weightKg`), converted only for display via `src/lib/units.ts`.

## Design
The UI follows Apple's iOS design kit (HIG, iOS 26), even in the browser and on Android.
- Colours are iOS semantic colour tokens in `src/index.css` (`--label`, `--label-2`, `--cell`, `--bg`, `--fill-3`, `--separator`, `--tint`, `--pr`); light/dark follow the system. Don't hard-code colours.
- Two deliberate departures from Apple's values, both for WCAG AA (the axe test in `e2e/qa.spec.ts` enforces it): the light-mode tint is #1b7032, and `--label-2` is 76% rather than 60%.
- Lists are inset grouped (`.list` / `.list-row`, `.section-label` for headers, `.section-title` for Fitness-style titles); cards are `.card`. Buttons are capsules: `.btn` (gray: tinted text on a fill), `.btn-primary` (filled). Sheets float inset with a grabber.
- Numbers (weights, reps, timers, stats) use SF Pro Rounded with tabular figures; add new numeric classes to the `ui-rounded` rule. PRs are yellow (`--pr`) with black text.
- Glass (`.glass`) is for floating chrome only: the tab bar, the docked `WorkoutBar`, the rest timer, back buttons.
- Tab bar glyphs are SF Symbols-style SVGs in `src/components/Icon.tsx`; content icons use lucide.
- In a workout, the next set of the exercise you're on gets `.set-row.current`.

## Conventions
- IDs are `crypto.randomUUID()` generated on the device; library exercises use their free-exercise-db string id.
- Synced rows carry `updatedAt` (ms epoch locally, timestamptz in Postgres) and soft-delete via `deletedAt`. Always filter out `deletedAt` rows.
- Don't index booleans in Dexie (IndexedDB can't); filter instead.
- When adding or changing a synced table, update `src/lib/types.ts`, `src/db/db.ts` (new Dexie version), and add a new file under `supabase/migrations/` with RLS enabled.
- Domain logic lives in `src/lib/` as pure functions with Vitest tests next to them.

## Sync (src/sync/)
- Local-first: the app only ever reads/writes Dexie. `syncOnce` pulls then pushes in the background (on start, every minute while open, when back online, after finishing or editing a workout). Never await sync in UI flows.
- Push = rows with `updatedAt` ≥ the last push; pull = rows with `server_updated_at` > the last pull (server clock). Last write wins by `updatedAt`; the server trigger ignores writes older than the stored row.
- Never hard-delete synced rows: set `deletedAt` (and `updatedAt`) so the delete syncs.
- New synced table: add it to `SYNCED_TABLES` in `src/sync/mapping.ts` (parents before children) and give the migration `server_updated_at` + the `touch_server_updated_at` trigger.
- The Supabase client is lazy-loaded (`src/sync/supabase.ts`) so it never slows app start. Builds without `VITE_SUPABASE_*` run local-only.
- E2E builds point at a fake project (`https://gynnasium-test.supabase.co`); `e2e/sync.spec.ts` answers its requests with `page.route`.

## Charts (src/components/charts/)
- Plain SVG, no chart library. 2px lines, ringed end-dot labelled with the latest value, 1px recessive grid, crosshair + tooltip on touch/hover/arrow keys, legend only for 2+ series, a "Show as table" view.
- Colours are `--chart-primary` / `--chart-muted` / `--chart-grid`, validated for colour-blind separation and contrast in both themes. `--chart-muted` is de-emphasis only (always with a legend).

## Checks before pushing
```sh
npm run lint && npm run typecheck && npm test
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # in cloud sessions; plain `npm run test:e2e` elsewhere
```
E2E runs on an emulated Pixel 7 against the production build (so the service worker / offline mode is tested).
Screenshots go to `test-results/screens/`.

## Workflow
- Work on a feature branch, open a PR against `main`. Vercel posts a preview URL on each PR for testing on a real phone.
