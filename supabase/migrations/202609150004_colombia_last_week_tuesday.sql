begin;

do $$
declare
  changed integer;
  already_changed integer;
begin
  update public.maintenance_slots
  set starts_at = starts_at - interval '1 day',
      ends_at = ends_at - interval '1 day'
  where country = 'CO'
    and id between 36 and 40
    and (starts_at at time zone 'America/Bogota')::date = date '2026-09-30';

  get diagnostics changed = row_count;
  select count(*) into already_changed
  from public.maintenance_slots
  where country = 'CO'
    and id between 36 and 40
    and (starts_at at time zone 'America/Bogota')::date = date '2026-09-29';

  if changed = 0 and already_changed = 5 then
    null;
  elsif changed <> 5 then
    raise exception 'Expected to move 5 Colombia slots, moved %', changed;
  end if;
end;
$$;

commit;
