-- Domain-only entry, explicitly requested: no email ownership verification.
begin;
create table public.maintenance_visitors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (email ~ '^[a-z0-9._%+-]+@gea[.]com$'),
  created_at timestamptz not null default now()
);
alter table public.maintenance_visitors enable row level security;
revoke all on public.maintenance_visitors from public, anon, authenticated;

create function public.maintenance_enter(p_full_name text, p_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_email text := lower(btrim(p_email));
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[a-z0-9._%+-]+@gea[.]com$' then raise exception 'INVALID_DOMAIN'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120 then raise exception 'NAME_REQUIRED'; end if;
  if exists(select 1 from public.maintenance_visitors where user_id = v_user and email <> v_email) then raise exception 'IDENTITY_LOCKED'; end if;
  insert into public.maintenance_visitors(user_id, full_name, email)
    values(v_user, btrim(p_full_name), v_email)
    on conflict(user_id) do update set full_name = excluded.full_name;
end;
$$;

create function public.maintenance_access()
returns table(full_name text, email text)
language sql stable security definer set search_path = '' as $$
  select v.full_name, v.email from public.maintenance_visitors v where v.user_id = auth.uid();
$$;

create or replace function public.maintenance_reserve(p_slot_id integer, p_full_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_email text; v_start timestamptz;
  v_existing public.maintenance_reservations; v_id uuid;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select v.email into v_email from public.maintenance_visitors v where v.user_id = v_user;
  if v_email is null or v_email !~ '^[a-z0-9._%+-]+@gea[.]com$' then raise exception 'INVALID_DOMAIN'; end if;
  if p_full_name is null or char_length(btrim(p_full_name)) not between 2 and 120 then raise exception 'NAME_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(v_email, 1));
  select * into v_existing from public.maintenance_reservations r where r.user_id = v_user;
  if found then
    if v_existing.slot_id = p_slot_id then return v_existing.id; end if;
    raise exception 'ALREADY_BOOKED';
  end if;
  if exists(select 1 from public.maintenance_reservations r where r.email = v_email) then raise exception 'EMAIL_ALREADY_BOOKED'; end if;
  select s.starts_at into v_start from public.maintenance_slots s where s.id = p_slot_id for update;
  if not found then raise exception 'INVALID_SLOT'; end if;
  if v_start <= now() then raise exception 'PAST_SLOT'; end if;
  if exists(select 1 from public.maintenance_reservations r where r.slot_id = p_slot_id) then raise exception 'SLOT_TAKEN'; end if;
  insert into public.maintenance_reservations(slot_id, user_id, full_name, email)
    values(p_slot_id, v_user, btrim(p_full_name), v_email) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.maintenance_enter(text, text) from public;
revoke all on function public.maintenance_access() from public;
grant execute on function public.maintenance_enter(text, text) to authenticated;
grant execute on function public.maintenance_access() to authenticated;
commit;
