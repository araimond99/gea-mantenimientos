-- September 2026. Run once in the SQL Editor of a new Supabase project.
begin;

create table public.maintenance_slots (
  id integer primary key check (id between 1 and 40),
  country text not null check (country in ('MX', 'CO')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at = starts_at + interval '15 minutes'),
  check ((country = 'MX' and id between 1 and 20) or (country = 'CO' and id between 21 and 40)),
  unique (country, starts_at)
);

create table public.maintenance_reservations (
  id uuid primary key default gen_random_uuid(),
  slot_id integer not null unique references public.maintenance_slots(id),
  user_id uuid not null unique references auth.users(id),
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Roles are assigned only by the project owner in SQL; never from user metadata.
create table public.maintenance_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.maintenance_slots enable row level security;
alter table public.maintenance_reservations enable row level security;
alter table public.maintenance_admins enable row level security;

-- Only the functions below can read or write application data from the API.
revoke all on public.maintenance_slots, public.maintenance_reservations, public.maintenance_admins from public, anon, authenticated;

with countries as (
  select 'MX'::text as country, 'America/Mexico_City'::text as zone,
    array['2026-09-21','2026-09-22','2026-09-28','2026-09-29']::date[] as dates, 0 as base
  union all
  select 'CO', 'America/Bogota', array['2026-09-21','2026-09-23','2026-09-28','2026-09-30']::date[], 20
), schedule as (
  select (c.base + (d.ordinality - 1) * 5 + t.ordinality)::integer as id, c.country,
    (d.day + t.time) at time zone c.zone as starts_at
  from countries c
  cross join lateral unnest(c.dates) with ordinality d(day, ordinality)
  cross join unnest(array['09:00','09:30','10:00','10:30','11:00']::time[]) with ordinality t(time, ordinality)
)
insert into public.maintenance_slots (id, country, starts_at, ends_at)
select id, country, starts_at, starts_at + interval '15 minutes' from schedule;

create function public.maintenance_availability()
returns table (id integer, country text, starts_at timestamptz, ends_at timestamptz, available boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.country, s.starts_at, s.ends_at,
    s.starts_at > now() and not exists (select 1 from public.maintenance_reservations r where r.slot_id = s.id)
  from public.maintenance_slots s order by s.country desc, s.starts_at;
$$;

create function public.maintenance_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.maintenance_admins a where a.user_id = auth.uid());
$$;

create function public.maintenance_my_reservation()
returns table (id uuid, slot_id integer, full_name text, email text, created_at timestamptz, country text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.slot_id, r.full_name, r.email, r.created_at, s.country, s.starts_at, s.ends_at
  from public.maintenance_reservations r join public.maintenance_slots s on s.id = r.slot_id
  where r.user_id = auth.uid();
$$;

create function public.maintenance_reserve(p_slot_id integer, p_full_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_start timestamptz;
  v_existing public.maintenance_reservations;
  v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select lower(u.email) into v_email from auth.users u
    where u.id = v_user and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120 then
    raise exception 'NAME_REQUIRED';
  end if;

  -- Serialize attempts from this person, then attempts for this slot.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_existing from public.maintenance_reservations r where r.user_id = v_user;
  if found then
    if v_existing.slot_id = p_slot_id then return v_existing.id; end if;
    raise exception 'ALREADY_BOOKED';
  end if;
  select s.starts_at into v_start from public.maintenance_slots s where s.id = p_slot_id for update;
  if not found then raise exception 'INVALID_SLOT'; end if;
  if v_start <= now() then raise exception 'PAST_SLOT'; end if;
  if exists (select 1 from public.maintenance_reservations r where r.slot_id = p_slot_id) then
    raise exception 'SLOT_TAKEN';
  end if;
  insert into public.maintenance_reservations(slot_id, user_id, full_name, email)
    values (p_slot_id, v_user, btrim(p_full_name), v_email) returning id into v_id;
  return v_id;
end;
$$;

create function public.maintenance_admin_reservations()
returns table (id uuid, slot_id integer, full_name text, email text, created_at timestamptz, country text, starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.maintenance_is_admin() then raise exception 'NOT_ADMIN'; end if;
  return query
    select r.id, r.slot_id, r.full_name, r.email, r.created_at, s.country, s.starts_at, s.ends_at
    from public.maintenance_reservations r join public.maintenance_slots s on s.id = r.slot_id
    order by s.starts_at, s.country;
end;
$$;

revoke all on function public.maintenance_availability() from public;
revoke all on function public.maintenance_is_admin() from public;
revoke all on function public.maintenance_my_reservation() from public;
revoke all on function public.maintenance_reserve(integer, text) from public;
revoke all on function public.maintenance_admin_reservations() from public;
grant execute on function public.maintenance_availability() to anon, authenticated;
grant execute on function public.maintenance_is_admin() to authenticated;
grant execute on function public.maintenance_my_reservation() to authenticated;
grant execute on function public.maintenance_reserve(integer, text) to authenticated;
grant execute on function public.maintenance_admin_reservations() to authenticated;

commit;
