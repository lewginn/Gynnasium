# Gynnasium

A subscription-free gym tracker: log workouts fast on your phone, track PRs and estimated 1RMs, build plans by hand or with AI.
It's a web app you can install to your home screen, and it works offline.

## Status

| Phase | Scope | State |
|---|---|---|
| 0 | App shell, offline support, exercise library, settings, schema, CI | ✅ |
| 1 | Plan builder + suggestions + templates, workout logger, rest timer, PRs, e1RM, history | ✅ |
| 2 | Body metrics, progress charts, Supabase sync + login | Next |
| 3 | AI plan builder and chat (Claude) | |
| 4 | Progressive overload, Garmin FIT export, native app wrapper | |

## Development

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests on an emulated Pixel 7 (Playwright), against the production build
npm run lint && npm run typecheck
```

Copy `.env.example` to `.env.local` and fill in the Supabase anon key. The app runs fine without it: everything is stored on the device until sync arrives in Phase 2.

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
