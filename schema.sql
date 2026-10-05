-- =====================================================================
-- Strong With Sherni · Corporate Program
-- Database setup. Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to run once on a new project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

-- Coaches (Vanshika). Added by hand after creating your login (see README).
create table if not exists public.coaches (
  auth_uid   uuid primary key references auth.users(id) on delete cascade,
  name       text not null default 'Coach',
  created_at timestamptz not null default now()
);

-- One row per employee in a program.
create table if not exists public.participants (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  phone          text,
  email          text,
  company        text not null default 'Goldman Sachs',
  team           text,
  start_date     date not null default current_date,
  workday_start  time not null default '09:00',
  access_code    text not null unique,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Which signed-in device belongs to which participant (filled by claim_code).
create table if not exists public.participant_devices (
  auth_uid       uuid primary key references auth.users(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at     timestamptz not null default now()
);

-- Plans uploaded by the coach. The newest plan whose starts_on has arrived is the active one.
create table if not exists public.plans (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  phase          int  not null default 1,
  starts_on      date not null,
  data           jsonb not null,
  created_at     timestamptz not null default now()
);
create index if not exists plans_participant_idx on public.plans(participant_id, starts_on desc);

create table if not exists public.meal_logs (
  participant_id uuid not null references public.participants(id) on delete cascade,
  day            date not null,
  meal_id        text not null,
  option_index   int  not null default 0,
  quick          boolean not null default false,
  item           text,
  kcal           int, protein int, carbs int, fat int, fibre int,
  logged_at      timestamptz not null default now(),
  primary key (participant_id, day, meal_id)
);

create table if not exists public.water_logs (
  participant_id uuid not null references public.participants(id) on delete cascade,
  day            date not null,
  glasses        int  not null default 0 check (glasses between 0 and 30),
  updated_at     timestamptz not null default now(),
  primary key (participant_id, day)
);

create table if not exists public.workout_logs (
  participant_id uuid not null references public.participants(id) on delete cascade,
  day            date not null,
  workout        text,
  done_sets      jsonb not null default '{}'::jsonb,
  weights        jsonb not null default '{}'::jsonb,
  completed      boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, day)
);

create table if not exists public.checkins (
  participant_id uuid not null references public.participants(id) on delete cascade,
  day            date not null,
  energy         smallint check (energy between 1 and 5),
  slump          boolean,
  sleep_hours    numeric(3,1) check (sleep_hours between 0 and 14),
  steps          int check (steps between 0 and 100000),
  note           text,
  updated_at     timestamptz not null default now(),
  primary key (participant_id, day)
);

-- ---------- Helper functions -----------------------------------------

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coaches where auth_uid = auth.uid());
$$;

create or replace function public.current_participant() returns uuid
language sql stable security definer set search_path = public as $$
  select d.participant_id
  from public.participant_devices d
  join public.participants p on p.id = d.participant_id and p.active
  where d.auth_uid = auth.uid();
$$;

-- Employee enters their personal code. Links this device to them.
create or replace function public.claim_code(p_code text)
returns table (participant_id uuid, full_name text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select p.id, p.full_name into v_id, v_name
  from public.participants p
  where p.access_code = upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'))
    and p.active;
  if v_id is null then
    raise exception 'That code was not recognised. Check it, or ask Vanshika for a new one.';
  end if;
  insert into public.participant_devices (auth_uid, participant_id)
  values (auth.uid(), v_id)
  on conflict (auth_uid) do update set participant_id = excluded.participant_id, created_at = now();
  return query select v_id, v_name;
end $$;

-- Employee can change only their own workday start time.
create or replace function public.set_workday_start(p_time time) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.participants set workday_start = p_time where id = public.current_participant();
end $$;

-- Team challenge: habit points this week (Monday onward). Returns team names and totals only.
create or replace function public.team_leaderboard()
returns table (team text, points bigint, members bigint)
language sql stable security definer set search_path = public as $$
  with wk as (select (date_trunc('week', (now() at time zone 'Asia/Kolkata')))::date as monday),
  pts as (
    select m.participant_id, count(*)::bigint as p from public.meal_logs m, wk where m.day >= wk.monday group by 1
    union all
    select c.participant_id, 2 * count(*)::bigint from public.checkins c, wk where c.day >= wk.monday group by 1
    union all
    select w.participant_id, 3 * count(*)::bigint from public.workout_logs w, wk where w.day >= wk.monday and w.completed group by 1
    union all
    select x.participant_id, 2 * count(*)::bigint from public.water_logs x, wk where x.day >= wk.monday and x.glasses >= 12 group by 1
  )
  select p.team, coalesce(sum(pts.p),0)::bigint as points, count(distinct p.id)::bigint as members
  from public.participants p
  left join pts on pts.participant_id = p.id
  where p.active and p.team is not null and p.team <> ''
    and auth.uid() is not null
  group by p.team
  order by points desc;
$$;

-- ---------- Row-level security ----------------------------------------
-- Employees see and change only their own rows. The coach sees everything.

alter table public.coaches             enable row level security;
alter table public.participants        enable row level security;
alter table public.participant_devices enable row level security;
alter table public.plans               enable row level security;
alter table public.meal_logs           enable row level security;
alter table public.water_logs          enable row level security;
alter table public.workout_logs        enable row level security;
alter table public.checkins            enable row level security;

drop policy if exists coaches_self on public.coaches;
create policy coaches_self on public.coaches for select using (auth_uid = auth.uid());

drop policy if exists participants_read on public.participants;
create policy participants_read on public.participants for select
  using (id = public.current_participant() or public.is_coach());
drop policy if exists participants_coach_write on public.participants;
create policy participants_coach_write on public.participants for all
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists devices_read on public.participant_devices;
create policy devices_read on public.participant_devices for select
  using (auth_uid = auth.uid() or public.is_coach());
drop policy if exists devices_coach_delete on public.participant_devices;
create policy devices_coach_delete on public.participant_devices for delete using (public.is_coach());

drop policy if exists plans_read on public.plans;
create policy plans_read on public.plans for select
  using (participant_id = public.current_participant() or public.is_coach());
drop policy if exists plans_coach_write on public.plans;
create policy plans_coach_write on public.plans for all
  using (public.is_coach()) with check (public.is_coach());

-- Same rule for every log table.
do $$
declare t text;
begin
  foreach t in array array['meal_logs','water_logs','workout_logs','checkins'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select using (participant_id = public.current_participant() or public.is_coach())', t);
    execute format('drop policy if exists %1$s_own_insert on public.%1$s', t);
    execute format('create policy %1$s_own_insert on public.%1$s for insert with check (participant_id = public.current_participant())', t);
    execute format('drop policy if exists %1$s_own_update on public.%1$s', t);
    execute format('create policy %1$s_own_update on public.%1$s for update using (participant_id = public.current_participant()) with check (participant_id = public.current_participant())', t);
    execute format('drop policy if exists %1$s_own_delete on public.%1$s', t);
    execute format('create policy %1$s_own_delete on public.%1$s for delete using (participant_id = public.current_participant())', t);
  end loop;
end $$;

-- ---------- Permissions -------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.claim_code(text), public.set_workday_start(time),
  public.team_leaderboard(), public.is_coach(), public.current_participant() to authenticated;
revoke execute on function public.claim_code(text), public.set_workday_start(time),
  public.team_leaderboard(), public.is_coach(), public.current_participant() from public, anon;
grant execute on function public.claim_code(text), public.set_workday_start(time),
  public.team_leaderboard(), public.is_coach(), public.current_participant() to authenticated;
