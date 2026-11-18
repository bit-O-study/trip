-- Rename/merge used categories atomically, with a checked snapshot.
create or replace function trip.rename_expense_category(p_trip_id uuid, p_from text, p_to text, p_expected jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then
  raise exception 'No edit permission' using errcode='42501';
 end if;
 -- Expense writes hold a share lock here: serialize the snapshot check and update.
 perform 1 from trip.trips where id=p_trip_id and deleted_at is null for update;
 if not found then raise exception 'Trip not found' using errcode='42501'; end if;
 p_from := btrim(p_from); p_to := btrim(p_to);
 if p_from is null or p_to is null or length(p_from) not between 1 and 30
   or length(p_to) not between 1 and 30 or p_from=p_to
   or p_expected is null or jsonb_typeof(p_expected) <> 'array' then
  raise exception 'Invalid category change' using errcode='22023';
 end if;
 select count(*) into affected from trip.expenses where trip_id=p_trip_id and category=p_from;
 if affected=0 or affected <> jsonb_array_length(p_expected) or affected <> (
  select count(distinct e.id) from trip.expenses e
  join jsonb_to_recordset(p_expected) as expected(id uuid, updated_at timestamptz)
    on expected.id=e.id and expected.updated_at=e.updated_at
  where e.trip_id=p_trip_id and e.category=p_from
 ) then raise exception 'Expenses changed' using errcode='40001'; end if;
 update trip.expenses set category=p_to, updated_at=clock_timestamp()
  where trip_id=p_trip_id and category=p_from;
 return affected;
end $$;
revoke all on function trip.rename_expense_category(uuid,text,text,jsonb) from public,anon;
grant execute on function trip.rename_expense_category(uuid,text,text,jsonb) to authenticated;
