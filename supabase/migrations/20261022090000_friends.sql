-- Friends: add someone by email; once they accept, you each see the other's recent workouts and PRs.
-- Nobody gets read access to anyone else's tables. Friends' data only comes out through the
-- security-definer functions below, as a summary, so the sync engine never pulls a friend's rows.

create table if not exists public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null default auth.uid() references auth.users on delete cascade,
  addressee_email text not null check (addressee_email = lower(addressee_email)),
  addressee_id uuid references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_email)
);
create index if not exists friendships_addressee_email on public.friendships (addressee_email);
alter table public.friendships enable row level security;

-- You can send a request (not to yourself), see requests you're part of, and remove them.
-- Accepting goes through accept_friend(), so nobody can rewrite who a request is from.
create policy "Send requests" on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending' and addressee_id is null
    and addressee_email <> lower((select auth.jwt()) ->> 'email')
  );
create policy "See your requests" on public.friendships for select to authenticated
  using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
    or addressee_email = lower((select auth.jwt()) ->> 'email')
  );
create policy "Remove your requests" on public.friendships for delete to authenticated
  using (
    requester_id = (select auth.uid()) or addressee_id = (select auth.uid())
    or addressee_email = lower((select auth.jwt()) ->> 'email')
  );

-- Everyone you're connected with or have a request with, with names to show.
create or replace function public.friend_list()
returns table (id uuid, status text, incoming boolean, name text, email text)
language sql stable security definer set search_path = public as $$
  select f.id, f.status, (f.requester_id <> auth.uid()) as incoming,
    case
      when f.requester_id = auth.uid() then coalesce(pa.display_name, f.addressee_email)
      else coalesce(pr.display_name, ur.email)
    end as name,
    case when f.requester_id = auth.uid() then f.addressee_email else ur.email end as email
  from friendships f
  left join profiles pr on pr.id = f.requester_id
  left join profiles pa on pa.id = f.addressee_id
  left join auth.users ur on ur.id = f.requester_id
  where f.requester_id = auth.uid() or f.addressee_id = auth.uid()
    or f.addressee_email = lower(auth.jwt() ->> 'email')
  order by f.status desc, name
$$;

-- Accept a request sent to your email.
create or replace function public.accept_friend(request_id uuid)
returns void
language sql security definer set search_path = public as $$
  update friendships set addressee_id = auth.uid(), status = 'accepted'
  where id = request_id and status = 'pending' and addressee_email = lower(auth.jwt() ->> 'email')
$$;

-- Friends' finished workouts since `since`, newest first: name, set count, and any PR sets.
create or replace function public.friend_feed(since timestamptz default now() - interval '30 days')
returns table (
  friend_id uuid, friend_name text, session_id uuid, session_name text,
  started_at timestamptz, ended_at timestamptz, set_count int, prs jsonb
)
language sql stable security definer set search_path = public as $$
  with friends as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as id
    from friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.addressee_id)
  ),
  done as (
    select se.session_id, l.exercise_id, l.weight_kg, l.reps, l.duration_sec, l.prs, l.set_type
    from session_exercises se
    join set_logs l on l.session_exercise_id = se.id
    where se.user_id in (select id from friends)
      and se.deleted_at is null and l.deleted_at is null and l.completed_at is not null
  )
  select s.user_id, coalesce(p.display_name, 'Friend'), s.id, s.name, s.started_at, s.ended_at,
    (select count(*) from done d where d.session_id = s.id and d.set_type <> 'warmup')::int,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'exercise_id', d.exercise_id, 'weight_kg', d.weight_kg, 'reps', d.reps,
        'duration_sec', d.duration_sec, 'prs', d.prs))
      from done d where d.session_id = s.id and cardinality(d.prs) > 0
    ), '[]'::jsonb)
  from workout_sessions s
  join friends fr on fr.id = s.user_id
  left join profiles p on p.id = s.user_id
  where s.deleted_at is null and s.ended_at is not null and s.started_at >= since
  order by s.started_at desc
  limit 50
$$;

revoke all on function public.friend_list() from public, anon;
revoke all on function public.accept_friend(uuid) from public, anon;
revoke all on function public.friend_feed(timestamptz) from public, anon;
grant execute on function public.friend_list() to authenticated;
grant execute on function public.accept_friend(uuid) to authenticated;
grant execute on function public.friend_feed(timestamptz) to authenticated;
