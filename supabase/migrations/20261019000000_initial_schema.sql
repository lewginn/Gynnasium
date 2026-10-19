-- Initial schema. Mirrors the local Dexie tables in src/db/db.ts.
--
-- Every user-owned table has user_id (defaulting to the signed-in user) and row-level security,
-- so each account can only ever see and change its own rows. Friends/sharing will add policies later.
-- IDs are generated on the device (crypto.randomUUID) so rows can be created offline.
-- updated_at / deleted_at drive sync: deletes are soft so other devices learn about them.
-- exercise_id is text: bundled library exercises use the free-exercise-db id, custom ones a uuid.

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  units text not null default 'kg' check (units in ('kg', 'lb')),
  default_rest_sec int not null default 120 check (default_rest_sec between 0 and 1800),
  show_rpe boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.custom_exercises (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  primary_muscles text[] not null,
  secondary_muscles text[] not null default '{}',
  region text not null check (region in ('upper', 'lower', 'core')),
  movement_pattern text not null,
  equipment text not null,
  mechanic text not null check (mechanic in ('compound', 'isolation')),
  default_rest_sec int not null default 120,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.plans (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  goal text,
  is_active boolean not null default false,
  created_by text not null default 'manual' check (created_by in ('manual', 'ai')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Every change to a plan (manual or AI) is snapshotted so it can be reviewed and undone.
create table public.plan_revisions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references public.plans on delete cascade,
  version int not null,
  snapshot jsonb not null,
  change_summary text,
  source text not null check (source in ('manual', 'ai')),
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);

create table public.plan_days (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references public.plans on delete cascade,
  name text not null,
  "order" int not null,
  focus_muscles text[] not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.plan_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_day_id uuid not null references public.plan_days on delete cascade,
  exercise_id text not null,
  "order" int not null,
  superset_group text,
  target_sets int not null check (target_sets between 1 and 20),
  rep_min int not null check (rep_min >= 1),
  rep_max int not null check (rep_max >= rep_min),
  target_rpe numeric(3, 1) check (target_rpe between 1 and 10),
  rest_sec int not null,
  progression_rule text not null default 'double_progression'
    check (progression_rule in ('double_progression', 'linear', 'none')),
  alternates text[] not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.workout_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_day_id uuid references public.plan_days on delete set null,
  name text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  notes text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.session_exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references public.workout_sessions on delete cascade,
  exercise_id text not null,
  "order" int not null,
  swapped_from_exercise_id text,
  notes text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.set_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_exercise_id uuid not null references public.session_exercises on delete cascade,
  exercise_id text not null,
  set_number int not null,
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'failure')),
  weight_kg numeric(6, 2) not null check (weight_kg >= 0),
  reps int not null check (reps >= 0),
  rpe numeric(3, 1) check (rpe between 1 and 10),
  completed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.body_metrics (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('bodyweight', 'bodyfat', 'waist', 'chest', 'arm', 'thigh')),
  value numeric(7, 2) not null,
  date date not null,
  source text not null default 'manual' check (source in ('manual', 'garmin', 'health')),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Sync pulls "everything of mine changed since X"; history and PR queries go by exercise and time.
create index on public.custom_exercises (user_id, updated_at);
create index on public.plans (user_id, updated_at);
create index on public.plan_revisions (plan_id, version desc);
create index on public.plan_days (user_id, updated_at);
create index on public.plan_exercises (user_id, updated_at);
create index on public.workout_sessions (user_id, updated_at);
create index on public.workout_sessions (user_id, started_at desc);
create index on public.session_exercises (user_id, updated_at);
create index on public.set_logs (user_id, updated_at);
create index on public.set_logs (user_id, exercise_id, completed_at desc);
create index on public.body_metrics (user_id, updated_at);
create index on public.body_metrics (user_id, type, date desc);

-- Row-level security: owner-only access on every table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'custom_exercises', 'plans', 'plan_revisions', 'plan_days', 'plan_exercises',
    'workout_sessions', 'session_exercises', 'set_logs', 'body_metrics'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated '
      'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
  end loop;
end
$$;
