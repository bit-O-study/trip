-- Trip packing checklist. Members read; owners/editors change through one RPC with optimistic locking.
create table if not exists trip.packing_items (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references trip.trips(id) on delete cascade,
 title text not null check (length(btrim(title)) between 1 and 100),
 category text not null check (length(btrim(category)) between 1 and 30),
 checked boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists packing_items_trip on trip.packing_items(trip_id, category, created_at);
alter table trip.packing_items enable row level security;
grant select on trip.packing_items to authenticated;
grant all on trip.packing_items to service_role;
drop policy if exists packing_items_read on trip.packing_items;
create policy packing_items_read on trip.packing_items for select to authenticated
 using (trip_private.is_trip_member(trip_id) and exists(select 1 from trip.trips t where t.id=trip_id and t.deleted_at is null));

-- Actions: save (create/update), delete, add_many (template; skips titles already in the same category).
create or replace function trip.manage_packing_item(p_trip_id uuid,p_action text,p_id uuid,p_expected timestamptz,p_data jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare affected integer := 0;
begin
 if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then
  raise exception 'No edit permission' using errcode='42501';
 end if;
 perform 1 from trip.trips where id=p_trip_id and deleted_at is null for share;
 if not found then raise exception 'Trip not found' using errcode='42501'; end if;
 if p_action is null or p_action not in ('save','delete','add_many') then raise exception 'Invalid action' using errcode='22023'; end if;
 if p_action='add_many' then
  if jsonb_typeof(p_data->'items') <> 'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then
   raise exception 'Invalid items' using errcode='22023';
  end if;
  insert into trip.packing_items(trip_id,title,category)
   select p_trip_id,btrim(i.title),btrim(i.category)
   from jsonb_to_recordset(p_data->'items') as i(title text,category text)
   where not exists(select 1 from trip.packing_items e where e.trip_id=p_trip_id and e.title=btrim(i.title) and e.category=btrim(i.category));
  get diagnostics affected = row_count;
 elsif p_action='delete' then
  delete from trip.packing_items where id=p_id and trip_id=p_trip_id and updated_at=p_expected;
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'Item changed or missing' using errcode='40001'; end if;
 elsif p_id is null then
  insert into trip.packing_items(trip_id,title,category,checked)
  values(p_trip_id,btrim(p_data->>'title'),btrim(p_data->>'category'),coalesce((p_data->>'checked')::boolean,false));
  affected := 1;
 else
  update trip.packing_items set title=btrim(p_data->>'title'),category=btrim(p_data->>'category'),
   checked=coalesce((p_data->>'checked')::boolean,false),updated_at=clock_timestamp()
  where id=p_id and trip_id=p_trip_id and updated_at=p_expected;
  get diagnostics affected = row_count;
  if affected=0 then raise exception 'Item changed or missing' using errcode='40001'; end if;
 end if;
 if (select count(*) from trip.packing_items where trip_id=p_trip_id) > 300 then
  raise exception 'Too many items' using errcode='22023';
 end if;
 return affected;
end $$;
revoke all on function trip.manage_packing_item(uuid,text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function trip.manage_packing_item(uuid,text,uuid,timestamptz,jsonb) to authenticated;
