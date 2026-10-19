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
| 4 | Progressive overload, Garmin FIT export, native app wrapper | Next |

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

### iPhone app (Capacitor)

`ios/` is a native iPhone app that wraps the same build as the website, using [Capacitor](https://capacitorjs.com). You need a Mac with Xcode.

1. In `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (as for the website), plus `VITE_API_ORIGIN` set to the website's address, e.g. `https://gynnasiumapp.vercel.app`. The app is not served from the website, so it needs that address to reach the coach.
2. Run `npm install`, then `npm run ios`. This builds the app, copies it into `ios/` and opens Xcode.
3. In Xcode, select the **App** target, then **Signing & Capabilities**, and pick your Apple ID as the team. Choose your iPhone and press Run.
   - With a free Apple ID, the app runs for 7 days before Xcode has to reinstall it.
   - A paid developer account ($99 a year) removes that limit and allows TestFlight.

Repeat step 2 after each change; Xcode keeps your signing settings. In the app, sign in with your email and password: emailed login links open the website, not the app. To change the app icon, edit `public/icon.svg` and run `npm run ios:assets`.

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

React + TypeScript + Vite, an installable web app via `vite-plugin-pwa`, IndexedDB via Dexie (local-first), Supabase (Postgres + auth) for sync, hosted on Vercel.
