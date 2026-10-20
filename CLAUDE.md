# Gynnasium — notes for Claude

Personal gym tracker, used on the owner's iPhone: **Safari is the main target** (also added to the home screen), Chrome second. Installable web app first, native wrapper (Capacitor) later.
The owner tests and signs off on PRs; Claude writes the code.

## Principles
- **Gym-floor first.** One-handed, sweaty, bad signal. Logging a set should take 1–2 taps. Tap targets ≥ 44px. Inputs use 16px font (no zoom on focus).
- **Local-first.** All reads/writes go to Dexie (`src/db/db.ts`). The network is never on the critical path. Supabase is for sync/backup only.
- **AI proposes, user approves.** AI output is a structured diff against plan rows, previewed before applying. Never write AI changes straight into plans.
- **Weights are stored in kg** (`weightKg`), converted only for display via `src/lib/units.ts`.

## Design
The app lives on an iPhone. One dark theme, warm and quiet: near-black panels, champagne gold for anything you can act on, burnt orange (ember) for heat. iOS text sizes, grouped lists and sheets. Being clear one-handed mid-set beats decoration. Build everything from the tokens in `src/index.css`.
- **Colour:** tokens only (`--bg`, `--cell`, `--sheet`, `--border`, `--label`, `--label-2`, `--fill-3`, `--separator`, `--tint`, `--tint-soft`, `--tint-line`, `--pr`, `--on-pr`, …). No literal colours in rules. Dark only: no light theme, `color-scheme: dark`.
  - Gold `--gold` #E7BA80 (= `--tint`): buttons, links, selection, progress. Text on gold is `--on-tint` (dark).
  - Ember `--ember` #D45D14: PRs (`--pr`, with dark `--on-pr`; white on ember fails AA), warm-ups, low volume, the glow.
  - Charts use `--chart-primary` #CF7F2E (a deeper amber that passes the dataviz validator on `--cell`; the gold itself is too light for a data mark) and `--chart-muted` for de-emphasis.
  - Contrast is enforced by the axe test in `e2e/qa.spec.ts`; check new colours against `--cell` and `--fill-3`.
- **Type:** iOS sizes (body 17, subhead 15, label 13, large title 34, semibold). One label style: 13px semibold, secondary colour, sentence case. No uppercase, no letter-spacing on labels. Numbers use `--font-numeric` with tabular figures.
- **Shape:** three radii, `--radius-s` (controls), `--radius-m` (rows inside cards), `--radius-l` (cards, sheets, the rest bar). Capsules only for buttons, chips, switches, progress bars and bars.
- **Surfaces:** cards are `--cell` with a 1px `--border`; sheets are `--sheet`. One decorative gradient: the ember glow behind the top of every page (`.app::before`); a workout in progress glows ember too. No other gradients or decorative shadows.
- **Bars:** the tab bar is docked to the bottom edge (active tab = gold pill); `WorkoutBar` is a sheet docked on top of it; the rest bar floats in a workout. They use the `.glass` material.
- **Components:** lists are `.list` / `.list-row` with `.section-label` headers; cards are `.card`; buttons `.btn` (outlined gold) and `.btn-primary` (filled gold). Selected chips and segments are outlined gold. Plain text links get a dotted underline. PRs are always `.pr-mark` (trophy on ember). Icons are lucide only.
- **Asking before something irreversible:** `useConfirm()` (`src/state/confirm.ts`), which opens a sheet. Never `window.confirm`. The action button says what it does ("Delete plan"), never "OK"; don't ask twice for the same thing.
- **Copy:** plain and short. No exclamation marks, no reassurance ("Nothing is lost"), no roadmap ("coming next"), no invented numbers (estimates the app can't back up). One name per thing across screens.
- **Layout:** test at 390px wide (iPhone 15): the workout set grid is the tightest screen, including with RPE on. Today is a launchpad, in order: the hero (`.hero`: the workout in progress, else the up-next plan day with one big Start), This week (`lib/week.ts`), the goal card when there's a goal, the latest PR while fresh, other days, recent workouts. On an iPhone the hero's Start button is visible without scrolling, with This week starting just below. Don't make Today's sections appear one by one: render once loaded, so buttons don't move under a thumb.
- In a workout, the next set of the exercise you're on gets `.set-row.current`.
- **Navigation:** tabs are Today, Plans, Exercises, Progress, Social (five at most). Each tab's large title ends with `<ProfileButton />` (your photo, as in Apple's apps), which opens Profile: name and photo, what friends can see, account and backup, and the row into Settings.
- Alternating weeks: a plan day may have `week` 1 (A) or 2 (B). Rotation order is `sortDays` (`src/lib/weeks.ts`): week A, then B. It follows the last day done, not the calendar. Show days with `dayLabel` wherever two weeks could have a day of the same name.

## Conventions
- IDs are `crypto.randomUUID()` generated on the device; library exercises use their free-exercise-db string id.
- Synced rows carry `updatedAt` (ms epoch locally, timestamptz in Postgres) and soft-delete via `deletedAt`. Always filter out `deletedAt` rows.
- Don't index booleans in Dexie (IndexedDB can't); filter instead.
- When adding or changing a synced table, update `src/lib/types.ts`, `src/db/db.ts` (new Dexie version), and add a new file under `supabase/migrations/` with RLS enabled.
- Domain logic lives in `src/lib/` as pure functions with Vitest tests next to them.

## Progression (src/lib/progression.ts)
- Workouts pre-fill from `suggestNext()`: the plan exercise's range and rule (double progression by default, linear, or off) against the last two workouts of that exercise. The card shows its one-line `note`. Never suggest less than last time except the deliberate ~10% drop after two misses.

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

## Goals and calendar (src/lib/schedule.ts, src/lib/goals.ts, src/pages/CalendarPage.tsx, src/pages/GoalPage.tsx)
- Dates are local `YYYY-MM-DD` strings; weekdays are 0 = Monday … 6 = Sunday. Use the helpers in `lib/schedule.ts`, not `Date` maths in components.
- A plan day can sit on fixed weekdays (`PlanDay.weekdays`). A plan with none keeps the up-next rotation; with some, `dayPlan()` / `nextWorkout()` decide Today's hero. Days off (`daysOff` table) skip scheduled workouts.
- One active goal (`Goal.isActive`) with a target date, targets (bodyweight uses the 7-day average, measurements the latest, lifts est. 1RM) and optional daily calories and protein.
- A goal's phases are plans with `goalId`, `startsOn` and `endsOn`. A phase covering a date wins over the active plan; `syncActivePhase()` makes it the active plan on Today. Re-planning soft-deletes the old phases.
- The coach's goal mode (`/goal/coach`) returns `goalPlan`; `checkGoalPlan()` clamps phases to today…target date, removes overlaps, and drops implausible food targets. Applied only on Apply, like any proposal.

## Social (src/social/, src/lib/friends.ts, supabase/migrations/20261022090000_friends.sql + 20261024090000_social.sql)
- Online-only, straight to Supabase (nothing in Dexie). Friendships are by email; accepting goes through `accept_friend()`.
- Nobody gets RLS read access to another user's tables. Friends' data only comes out of the security-definer functions (`friend_list`, `friend_feed`, `friend_leaderboard`, `friend_profile`) as a summary, so sync can never pull a friend's rows. Keep it that way.
- Each function honours the friend's `profiles.share_workouts` / `share_prs` on the server; the app never filters for privacy.
- Your profile (`profiles`: name, photo as a ≤60 kB JPEG data URL, sharing switches) is cached per account in localStorage by `src/social/profile.ts`, so the header photo works offline. Edits are optimistic and roll back on failure.

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
