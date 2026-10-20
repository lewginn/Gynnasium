-- Goals and the calendar.
-- * goals: something to train towards by a date (a holiday), with targets and nutrition.
-- * plans can be phases of a goal, used between starts_on and ends_on.
-- * plan_days can be fixed to weekdays (0 = Monday … 6 = Sunday).
-- * days_off: dates you can't train.
-- Run after 20261021090000_plan_day_week.sql.

create table public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  description text,
  starts_on date not null,
  target_date date not null,
  targets jsonb not null default '[]',
  calories integer,
  protein_g integer,
  nutrition_note text,
  is_active boolean not null default false,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table public.days_off (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  note text,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

alter table public.plans
  add column goal_id uuid references public.goals on delete set null,
  add column starts_on date,
  add column ends_on date;

alter table public.plan_days add column weekdays smallint[] not null default '{}';

do $$
declare
  t text;
begin
  foreach t in array array['goals', 'days_off'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated '
      'using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t
    );
    execute format('alter table public.%I add column server_updated_at timestamptz not null default now()', t);
    execute format('create index on public.%I (user_id, server_updated_at)', t);
    execute format(
      'create trigger touch_server_updated_at before insert or update on public.%I '
      'for each row execute function public.touch_server_updated_at()',
      t
    );
  end loop;
end
$$;
