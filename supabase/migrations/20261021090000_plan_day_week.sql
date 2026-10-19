-- Alternating weeks: a plan day can belong to week A (1) or week B (2); null means every week.
-- Run this before deploying the app version that syncs plan_days.week.
alter table public.plan_days add column if not exists week smallint check (week in (1, 2));
