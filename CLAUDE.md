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
- Today is a launchpad, in priority order: a hero (`.hero`: the workout in progress, else the up-next plan day with one big Start), This week (`lib/week.ts`), the latest PR while fresh, other days, recent workouts. Keep the hero and This week on the first screen.

## Conventions
- IDs are `crypto.randomUUID()` generated on the device; library exercises use their free-exercise-db string id.
- Synced rows carry `updatedAt` (ms epoch locally, timestamptz in Postgres) and soft-delete via `deletedAt`. Always filter out `deletedAt` rows.
- Don't index booleans in Dexie (IndexedDB can't); filter instead.
- When adding or changing a synced table, update `src/lib/types.ts`, `src/db/db.ts` (new Dexie version), and add a new file under `supabase/migrations/` with RLS enabled.
- Domain logic lives in `src/lib/` as pure functions with Vitest tests next to them.

## Checks before pushing
```sh
npm run lint && npm run typecheck && npm test
PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e   # in cloud sessions; plain `npm run test:e2e` elsewhere
```
E2E runs on an emulated Pixel 7 against the production build (so the service worker / offline mode is tested).
Screenshots go to `test-results/screens/`.

## Workflow
- Work on a feature branch, open a PR against `main`. Vercel posts a preview URL on each PR for testing on a real phone.
