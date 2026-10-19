# Gynnasium — notes for Claude

Personal gym tracker, used on the owner's iPhone: **Safari is the main target** (also added to the home screen), Chrome second. Installable web app first, native wrapper (Capacitor) later.
The owner tests and signs off on PRs; Claude writes the code.

## Principles
- **Gym-floor first.** One-handed, sweaty, bad signal. Logging a set should take 1–2 taps. Tap targets ≥ 44px. Inputs use 16px font (no zoom on focus).
- **Local-first.** All reads/writes go to Dexie (`src/db/db.ts`). The network is never on the critical path. Supabase is for sync/backup only.
- **AI proposes, user approves.** AI output is a structured diff against plan rows, previewed before applying. Never write AI changes straight into plans.
- **Weights are stored in kg** (`weightKg`), converted only for display via `src/lib/units.ts`.

## Design
The app lives on an iPhone, so it speaks iOS: semantic colours that follow light/dark, iOS text sizes, grouped lists, sheets. Imitating Apple is not the goal; being clear one-handed mid-set is. Build everything from the tokens in `src/index.css`.
- **Colour:** tokens only (`--label`, `--label-2`, `--cell`, `--bg`, `--fill-3`, `--separator`, `--tint`, `--pr`, `--on-pr`, …). No literal colours in rules. For WCAG AA (enforced by the axe test in `e2e/qa.spec.ts`), the light tint is #1b7032 and `--label-2` is 76%, both darker than Apple's values.
- **Type:** iOS sizes (body 17, subhead 15, label 13, large title 34). One label style: 13px semibold, secondary colour, sentence case. No uppercase, no letter-spacing on labels. Numbers use `--font-numeric` (SF Pro Rounded where available) with tabular figures.
- **Shape:** three radii, `--radius-s` (controls), `--radius-m` (rows inside cards), `--radius-l` (cards, sheets, the rest bar). Capsules only for buttons, chips, switches, progress bars and the floating bars.
- **Surfaces:** no gradients or decorative shadows. Glass (`.glass`) only on bars that float over content: the tab bar and `WorkoutBar`; the rest bar uses the same material.
- **Components:** lists are `.list` / `.list-row` with `.section-label` headers; cards are `.card`; buttons `.btn` (tint on gray) and `.btn-primary`. PRs are always `.pr-mark` (trophy on yellow). Icons are lucide only.
- **Asking before something irreversible:** `useConfirm()` (`src/state/confirm.ts`), which opens a sheet. Never `window.confirm`. The action button says what it does ("Delete plan"), never "OK"; don't ask twice for the same thing.
- **Copy:** plain and short. No exclamation marks, no reassurance ("Nothing is lost"), no roadmap ("coming next"), no invented numbers (estimates the app can't back up). One name per thing across screens.
- **Layout:** test at 390px wide (iPhone 15): the workout set grid is the tightest screen, including with RPE on. Today is a launchpad, in order: the hero (`.hero`: the workout in progress, else the up-next plan day with one big Start), This week (`lib/week.ts`), the latest PR while fresh, other days, recent workouts. On an iPhone the hero's Start button is visible without scrolling, with This week starting just below. Don't make Today's sections appear one by one: render once loaded, so buttons don't move under a thumb.
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

## Coach (api/coach.ts, src/lib/coach.ts, src/pages/CoachPage.tsx)
- `api/coach.ts` is a Vercel function (Node ESM): checks the Supabase login and `COACH_ALLOWED_EMAILS`, then calls Claude with structured output (`src/lib/coachSchema.ts`). It's compiled as plain Node, so its relative imports end in `.js`, and anything it imports from `src/` may only have type imports. Tests for it go in `api/_*.test.ts` (an underscore keeps Vercel from deploying a file as an endpoint).
- The app sends the chat plus a text context (plan with refs d1/x1, recent training, units). Claude replies with a message and either `newPlan` or `changes`; `src/lib/coach.ts` checks them against the library and the plan, and the page previews them. Nothing is written until Apply (`applyPlanChanges` / `createPlanFromProposal`).
- Instructions and the exercise catalogue form one cached system block: keep anything that varies per request out of it.

## iPhone app (ios/, capacitor.config.ts)
- Capacitor wraps `dist/`. Inside it, `location.protocol` is `capacitor:`. There's no `/api` on that origin, so the coach calls `${VITE_API_ORIGIN}/api/coach`, and `api/coach.ts` allows CORS from `capacitor://localhost` only. Emailed links go to the website (`linkOrigin()`), and the login screen hides the email-link option in the app.
- Don't edit `ios/App/App/public` (it's generated by `cap sync`). The icon and launch screen come from `npm run ios:assets`.

## Charts (src/components/charts/)
- Plain SVG, no chart library. 2px lines, ringed end-dot labelled with the latest value, 1px recessive grid, crosshair + tooltip on touch/hover/arrow keys, legend only for 2+ series, a "Show as table" view.
- Colours are `--chart-primary` / `--chart-muted` / `--chart-grid`, validated for colour-blind separation and contrast in both themes. `--chart-muted` is de-emphasis only (always with a legend).

## Checks before pushing
```sh
npm run lint && npm run typecheck && npm test
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # in cloud sessions; plain `npm run test:e2e` elsewhere
```
E2E runs on an emulated iPhone 15 (viewport, touch, user agent) against the production build, so the service worker / offline mode is tested.
The engine is Chromium, not WebKit, so Safari-only behaviour (e.g. no `navigator.vibrate`, audio needing a tap to unlock, `-webkit-` prefixes) isn't covered: check those by reading the code, and say so in the PR.
Screenshots go to `test-results/screens/`.

## Workflow
- Work on a feature branch, open a PR against `main`. Vercel posts a preview URL on each PR for testing on a real phone.
