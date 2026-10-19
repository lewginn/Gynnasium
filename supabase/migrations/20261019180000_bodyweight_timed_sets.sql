-- Bodyweight and timed exercises.
-- weight_kg can now be negative: assistance on bodyweight exercises (e.g. -20kg on an assisted pull-up machine).
-- duration_sec holds seconds for timed exercises (plank, farmer's walk).
-- Users can override how an exercise is logged; overrides sync with their settings.
alter table public.set_logs drop constraint if exists set_logs_weight_kg_check;
alter table public.set_logs add column duration_sec int check (duration_sec >= 0);

alter table public.custom_exercises add column logging text not null default 'weight_reps'
  check (logging in ('weight_reps', 'bodyweight', 'time'));

alter table public.user_settings add column logging_overrides jsonb not null default '{}';
