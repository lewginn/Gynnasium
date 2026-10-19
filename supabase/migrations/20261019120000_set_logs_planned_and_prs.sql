-- Sets are created as "planned" rows when a workout starts (pre-filled from last time) and completed with a tap,
-- so completed_at is null until the set is done. PRs detected on the device are stored with the set.
alter table public.set_logs alter column completed_at drop not null;
alter table public.set_logs add column prs text[] not null default '{}';
