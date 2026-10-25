-- Sticky notes on exercises ("Seat 4, grip wide"), shown every time you do that exercise.
-- * One live note per exercise, but no unique constraint: two devices offline can each create one, and a
--   constraint would make the second push fail. The app shows the most recently updated and, on the next
--   edit, soft-deletes the other (src/lib/notes.ts).
-- * exercise_id is text, like elsewhere: library exercises use the free-exercise-db id, custom ones a uuid.
-- * Private: owner-only RLS, and none of the friend functions read this table.
-- Run after 20261024090000_social.sql.

create table public.exercise_notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  exercise_id text not null,
  text text not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index on public.exercise_notes (user_id, exercise_id);

alter table public.exercise_notes enable row level security;
create policy "Owner can do everything" on public.exercise_notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

alter table public.exercise_notes add column server_updated_at timestamptz not null default now();
create index on public.exercise_notes (user_id, server_updated_at);
create trigger touch_server_updated_at before insert or update on public.exercise_notes
  for each row execute function public.touch_server_updated_at();
