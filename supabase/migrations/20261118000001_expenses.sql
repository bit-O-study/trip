-- Actual spending is separate from itinerary estimates. Integer minor units avoid rounding.
create table if not exists trip.expenses (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references trip.trips(id) on delete cascade,
 title text not null check (length(btrim(title)) between 1 and 100),
 category text not null check (length(btrim(category)) between 1 and 30),
 spent_on date not null,
 amount_minor bigint not null check (amount_minor between 1 and 99999999999),
 currency text not null check (currency in ('KRW','TWD','USD','JPY','EUR','CNY','VND','THB','SGD','HKD','GBP','AUD')),
 note text not null default '' check (length(note) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists expenses_trip_date on trip.expenses(trip_id,spent_on desc);
alter table trip.expenses enable row level security;
grant select on trip.expenses to authenticated;
grant all on trip.expenses to service_role;
drop policy if exists expenses_read on trip.expenses;
create policy expenses_read on trip.expenses for select to authenticated
 using (trip_private.is_trip_member(trip_id) and exists(select 1 from trip.trips t where t.id=trip_id and t.deleted_at is null));

create or replace function trip.manage_expense(p_trip_id uuid,p_action text,p_id uuid,p_expected timestamptz,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then
  raise exception 'No edit permission' using errcode='42501';
 end if;
 perform 1 from trip.trips where id=p_trip_id and deleted_at is null for share;
 if not found then raise exception 'Trip not found' using errcode='42501'; end if;
 if p_action not in ('save','delete') or p_action is null then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_action='delete' then
  delete from trip.expenses where id=p_id and trip_id=p_trip_id and updated_at=p_expected returning id into result;
 elsif p_id is null then
  insert into trip.expenses(trip_id,title,category,spent_on,amount_minor,currency,note)
  values(p_trip_id,btrim(p_data->>'title'),btrim(p_data->>'category'),(p_data->>'spent_on')::date,
    (p_data->>'amount_minor')::bigint,p_data->>'currency',coalesce(p_data->>'note','')) returning id into result;
 else
  update trip.expenses set title=btrim(p_data->>'title'),category=btrim(p_data->>'category'),
   spent_on=(p_data->>'spent_on')::date,amount_minor=(p_data->>'amount_minor')::bigint,
   currency=p_data->>'currency',note=coalesce(p_data->>'note',''),updated_at=clock_timestamp()
  where id=p_id and trip_id=p_trip_id and updated_at=p_expected returning id into result;
 end if;
 if result is null then raise exception 'Expense changed or missing' using errcode='40001'; end if;
 return result;
end $$;
revoke all on function trip.manage_expense(uuid,text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function trip.manage_expense(uuid,text,uuid,timestamptz,jsonb) to authenticated;
