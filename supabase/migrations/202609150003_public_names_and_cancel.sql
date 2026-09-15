-- Show the reserving person's name in the public schedule and allow self-cancellation.
begin;

drop function public.maintenance_availability();
create function public.maintenance_availability()
returns table (
  id integer,
  country text,
  starts_at timestamptz,
  ends_at timestamptz,
  available boolean,
  reserved_by text
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.country, s.starts_at, s.ends_at,
    s.starts_at > now() and r.id is null,
    r.full_name
  from public.maintenance_slots s
  left join public.maintenance_reservations r on r.slot_id = s.id
  order by s.country desc, s.starts_at;
$$;

create function public.maintenance_cancel()
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_deleted integer;
begin
  if v_user is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from public.maintenance_reservations where user_id = v_user;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.maintenance_availability() from public;
revoke all on function public.maintenance_cancel() from public;
grant execute on function public.maintenance_availability() to anon, authenticated;
grant execute on function public.maintenance_cancel() to authenticated;
commit;
