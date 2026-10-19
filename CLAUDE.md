# Gynnasium — notes for Claude

Personal gym tracker, installable web app first (Android Chrome is the main target), native wrapper (Capacitor) later.
The owner tests and signs off on PRs; Claude writes the code.

## Principles
- **Gym-floor first.** One-handed, sweaty, bad signal. Logging a set should take 1–2 taps. Tap targets ≥ 44px. Inputs use 16px font (no zoom on focus).
- **Local-first.** All reads/writes go to Dexie (`src/db/db.ts`). The network is never on the critical path. Supabase is for sync/backup only.
- **AI proposes, user approves.** AI output is a structured diff against plan rows, previewed before applying. Never write AI changes straight into plans.
- **Weights are stored in kg** (`weightKg`), converted only for display via `src/lib/units.ts`.

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
