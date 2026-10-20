# Gynnasium

A subscription-free gym tracker: log workouts fast on your phone, track PRs and estimated 1RMs, build plans by hand or with AI.
It's a web app you can install to your home screen, and it works offline.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | App shell, offline support, exercise library, settings, schema, CI | ✅ |
| 1 | Plan builder + suggestions + templates, workout logger, rest timer, PRs, e1RM, history | ✅ |
| 1.5 | Bodyweight & timed exercises, reorder mid-workout, edit past workouts | ✅ |
| 2 | Login (email link), sync & backup, body metrics, progress charts | ✅ |
| 3 | AI plan builder and chat (Claude) | ✅ |
| 4 | Progressive overload, Garmin FIT export, native app wrapper (iOS app started) | Next |
| 5 | Goals to a date, weekly schedule, calendar and days off, phased plans and food targets from the coach | ✅ |

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests on an emulated Pixel 7 (Playwright), against the production build
npm run lint && npm run typecheck
```

Copy `.env.example` to `.env.local` and fill in the Supabase anon key. The app runs fine without it: everything is stored on the device until sync arrives in Phase 2.

### The coach (Claude)

`api/coach.ts` is a Vercel function that calls the Anthropic API, so the key stays on the server. It needs two more environment variables in Vercel (server-only: no `VITE_` prefix):

- `ANTHROPIC_API_KEY`: from console.anthropic.com. Mark it Sensitive.
- `COACH_ALLOWED_EMAILS`: comma-separated emails of accounts allowed to use the coach (it spends your API credit).

`npm run dev` doesn't serve `/api`; use a Vercel preview to try the coach for real. The e2e tests mock it.

### iOS app

`ios/` is a [Capacitor](https://capacitorjs.com) project: the same web build, bundled into a native app, plus native haptics, keep-awake during a workout, and a "Rest over" notification when the phone is locked. The bridge lives in `src/native/`; the web app ignores it.

On a Mac with Xcode:

1. In `.env.local`, set the Supabase values and `VITE_WEB_URL` (your production Vercel URL; the coach and login emails go there).
2. `npm install`, then `npm run ios`. This builds, copies the build into `ios/`, and opens Xcode.
3. In Xcode, select the App target → Signing & Capabilities → choose your Team. If the bundle id `com.lewginn.gynnasium` is taken, change it there and in `capacitor.config.ts`.
4. Pick your iPhone and press Run. The first time, the iPhone asks you to trust the developer (Settings → General → VPN & Device Management).

The app carries its own copy of the web build, so after changing code run `npm run build:ios` (or `npm run ios`) and Run again. For TestFlight: Product → Archive → Distribute App, and raise the build number (General → Identity) each upload.

### Database

`supabase/migrations/` holds the schema. Apply a migration by pasting it into the Supabase dashboard's SQL editor, or with the Supabase CLI (`supabase db push`).

### Exercise library

`src/data/exercises.json` is generated from [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain):

```sh
curl -o /tmp/exercises.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
npm run build:exercises -- /tmp/exercises.json
```

Bump `LIBRARY_VERSION` in `src/db/db.ts` afterwards so installed apps reload it.

## Stack

React + TypeScript + Vite, an installable web app via `vite-plugin-pwa`, IndexedDB via Dexie (local-first), Supabase (Postgres + auth) for sync, hosted on Vercel. The iOS app wraps the same build with Capacitor.
