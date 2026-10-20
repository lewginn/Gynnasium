-- Social: profile photos, what friends can see, a weekly leaderboard and friend profiles.
-- Run after 20261022090000_friends.sql. As there, friends' data only comes out of the
-- security-definer functions below, and only what each person shares.

alter table public.profiles alter column display_name drop not null;
alter table public.profiles
  add column if not exists avatar text
    check (avatar is null or (avatar like 'data:image/jpeg;base64,%' and char_length(avatar) <= 60000)),
  add column if not exists share_workouts boolean not null default true,
  add column if not exists share_prs boolean not null default true;

-- The return types change, so these are dropped first.
drop function if exists public.friend_list();
drop function if exists public.friend_feed(timestamptz);

-- Everyone you're connected with or have a request with, with names and photos to show.
create function public.friend_list()
returns table (id uuid, status text, incoming boolean, friend_id uuid, name text, email text, avatar text)
language sql stable security definer set search_path = public as $$
  select f.id, f.status, (f.requester_id <> auth.uid()) as incoming,
    case when f.status = 'accepted' then
      case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
    end as friend_id,
    case
      when f.requester_id = auth.uid() then coalesce(pa.display_name, f.addressee_email)
      else coalesce(pr.display_name, ur.email)
    end as name,
    case when f.requester_id = auth.uid() then f.addressee_email else ur.email end as email,
    case when f.requester_id = auth.uid() then pa.avatar else pr.avatar end as avatar
  from friendships f
  left join profiles pr on pr.id = f.requester_id
  left join profiles pa on pa.id = f.addressee_id
  left join auth.users ur on ur.id = f.requester_id
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
    or f.addressee_email = lower(auth.jwt() ->> 'email')
  order by f.status desc, name
$$;

-- Your accepted friends' user ids.
create or replace function public.my_friends()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  from friendships f
  where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
$$;

-- Friends' finished workouts since `since`, newest first: name, set count, and any PR sets.
-- Leaves out friends who don't share workouts, and the PRs of friends who don't share PRs.
create function public.friend_feed(since timestamptz default now() - interval '30 days')
returns table (
  friend_id uuid, friend_name text, friend_avatar text, session_id uuid, session_name text,
  started_at timestamptz, ended_at timestamptz, set_count int, prs jsonb
)
language sql stable security definer set search_path = public as $$
  with friends as (
    select m.id, coalesce(p.share_workouts, true) as share_workouts, coalesce(p.share_prs, true) as share_prs
    from my_friends() as m(id) left join profiles p on p.id = m.id
  ),
  done as (
    select se.session_id, l.exercise_id, l.weight_kg, l.reps, l.duration_sec, l.prs, l.set_type
    from session_exercises se
    join set_logs l on l.session_exercise_id = se.id
    where se.user_id in (select id from friends where share_workouts)
      and se.deleted_at is null and l.deleted_at is null and l.completed_at is not null
  )
  select s.user_id, coalesce(p.display_name, u.email), p.avatar, s.id, s.name, s.started_at, s.ended_at,
    (select count(*) from done d where d.session_id = s.id and d.set_type <> 'warmup')::int,
    case when fr.share_prs then coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', d.exercise_id, 'weight_kg', d.weight_kg, 'reps', d.reps,
        'duration_sec', d.duration_sec, 'prs', d.prs))
      from done d where d.session_id = s.id and cardinality(d.prs) > 0
    ), '[]'::jsonb) else '[]'::jsonb end
  from workout_sessions s
  join friends fr on fr.id = s.user_id and fr.share_workouts
  left join profiles p on p.id = s.user_id
  left join auth.users u on u.id = s.user_id
  where s.deleted_at is null and s.ended_at is not null and s.started_at >= since
  order by s.started_at desc
  limit 50
$$;

-- You and your friends since `since` (the start of the week, in your time zone): workouts and
-- working sets. Friends who don't share workouts aren't on it.
create or replace function public.friend_leaderboard(since timestamptz)
returns table (user_id uuid, name text, avatar text, is_me boolean, workouts int, sets int)
language sql stable security definer set search_path = public as $$
  with people as (
    select auth.uid() as id
    union
    select m.id from my_friends() as m(id)
      left join profiles p on p.id = m.id
      where coalesce(p.share_workouts, true)
  )
  select pe.id, coalesce(p.display_name, u.email), p.avatar,
    pe.id = auth.uid(),
    (select count(*) from workout_sessions s
      where s.user_id = pe.id and s.deleted_at is null and s.ended_at is not null and s.started_at >= since)::int,
    (select count(*) from workout_sessions s
      join session_exercises se on se.session_id = s.id and se.deleted_at is null
      join set_logs l on l.session_exercise_id = se.id
      where s.user_id = pe.id and s.deleted_at is null and s.ended_at is not null and s.started_at >= since
        and l.deleted_at is null and l.completed_at is not null and l.set_type <> 'warmup')::int
  from people pe
  left join profiles p on p.id = pe.id
  left join auth.users u on u.id = pe.id
  where auth.uid() is not null
$$;

-- One friend's profile, or null if they aren't your friend. Workout dates (for streaks and counts)
-- only if they share workouts; best lifts and recent PRs only if they share PRs.
create or replace function public.friend_profile(friend uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with f as (
    select m.id, coalesce(p.display_name, u.email) as display_name, p.avatar,
      coalesce(p.share_workouts, true) as share_workouts, coalesce(p.share_prs, true) as share_prs
    from my_friends() as m(id)
    left join profiles p on p.id = m.id
    left join auth.users u on u.id = m.id
    where m.id = friend
  ),
  sets as (
    select se.exercise_id, l.weight_kg, l.reps, l.duration_sec, l.prs, l.completed_at
    from f
    join workout_sessions s on s.user_id = f.id and s.deleted_at is null and s.ended_at is not null
    join session_exercises se on se.session_id = s.id and se.deleted_at is null
    join set_logs l on l.session_exercise_id = se.id
    where f.share_prs and l.deleted_at is null and l.completed_at is not null and l.set_type <> 'warmup'
  ),
  best as (
    -- Each exercise's best set by estimated 1RM (Epley; the app recomputes it for display).
    select distinct on (exercise_id) exercise_id, weight_kg, reps, completed_at
    from sets
    where weight_kg > 0 and reps between 1 and 12
    order by exercise_id, weight_kg * (1 + reps / 30.0) desc
  )
  select jsonb_build_object(
    'name', f.display_name,
    'avatar', f.avatar,
    'share_workouts', f.share_workouts,
    'share_prs', f.share_prs,
    'workout_starts', case when f.share_workouts then coalesce((
      select jsonb_agg(s.started_at order by s.started_at desc)
      from workout_sessions s
      where s.user_id = f.id and s.deleted_at is null and s.ended_at is not null
        and s.started_at >= now() - interval '1 year'
    ), '[]'::jsonb) end,
    'best_lifts', case when f.share_prs then coalesce((
      select jsonb_agg(jsonb_build_object('exercise_id', b.exercise_id, 'weight_kg', b.weight_kg, 'reps', b.reps, 'at', b.completed_at)
        order by b.weight_kg * (1 + b.reps / 30.0) desc)
      from (select * from best order by weight_kg * (1 + reps / 30.0) desc limit 5) b
    ), '[]'::jsonb) end,
    'recent_prs', case when f.share_prs then coalesce((
      select jsonb_agg(r) from (
        select jsonb_build_object('exercise_id', exercise_id, 'weight_kg', weight_kg, 'reps', reps,
          'duration_sec', duration_sec, 'prs', prs, 'at', completed_at) as r
        from sets where cardinality(prs) > 0
        order by completed_at desc limit 10
      ) x
    ), '[]'::jsonb) end
  )
  from f
$$;

revoke all on function public.friend_list() from public, anon;
revoke all on function public.my_friends() from public, anon;
revoke all on function public.friend_feed(timestamptz) from public, anon;
revoke all on function public.friend_leaderboard(timestamptz) from public, anon;
revoke all on function public.friend_profile(uuid) from public, anon;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.my_friends() to authenticated;
grant execute on function public.friend_feed(timestamptz) to authenticated;
grant execute on function public.friend_leaderboard(timestamptz) to authenticated;
grant execute on function public.friend_profile(uuid) to authenticated;
