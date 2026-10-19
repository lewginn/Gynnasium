-- Sync support.
-- 1. Devices pull "everything changed since X". Using the client's updated_at for that would miss rows from a
--    device whose clock is behind, so the server stamps its own time on every write.
-- 2. Last write wins by the client's updated_at: a write older than the stored row is ignored, so a device
--    re-sending a stale copy can never overwrite a newer edit.
create or replace function public.touch_server_updated_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := now();
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_settings', 'custom_exercises', 'plans', 'plan_revisions', 'plan_days', 'plan_exercises',
    'workout_sessions', 'session_exercises', 'set_logs', 'body_metrics'
  ] loop
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
