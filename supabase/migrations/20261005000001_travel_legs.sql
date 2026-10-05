-- 이동 정보는 일정 위치가 아니라 방향이 있는 두 일정 사이에 저장한다.
create unique index if not exists itinerary_items_id_trip_key on trip.itinerary_items(id, trip_id);
create table if not exists trip.travel_legs (
  trip_id uuid not null references trip.trips(id) on delete cascade,
  from_item_id uuid not null,
  to_item_id uuid not null,
  mode text check (mode in ('walk','bicycle','car','taxi','bus','subway','train','flight','ferry','other')),
  minutes integer check (minutes between 0 and 43200),
  distance_km numeric check (distance_km between 0 and 50000),
  from_location_key text not null,
  to_location_key text not null,
  version integer not null default 1 check (version > 0),
  primary key (trip_id, from_item_id, to_item_id),
  foreign key (from_item_id, trip_id) references trip.itinerary_items(id, trip_id) on delete cascade,
  foreign key (to_item_id, trip_id) references trip.itinerary_items(id, trip_id) on delete cascade,
  check (from_item_id <> to_item_id)
);
alter table trip.travel_legs enable row level security;
grant select, insert, update, delete on trip.travel_legs to authenticated;
grant all on trip.travel_legs to service_role;
drop policy if exists travel_legs_read on trip.travel_legs;
create policy travel_legs_read on trip.travel_legs for select to authenticated
  using (trip_private.is_trip_member(trip_id));
drop policy if exists travel_legs_insert on trip.travel_legs;
create policy travel_legs_insert on trip.travel_legs for insert to authenticated
  with check (trip_private.can_edit_trip(trip_id));
drop policy if exists travel_legs_update on trip.travel_legs;
create policy travel_legs_update on trip.travel_legs for update to authenticated
  using (trip_private.can_edit_trip(trip_id)) with check (trip_private.can_edit_trip(trip_id));
drop policy if exists travel_legs_delete on trip.travel_legs;
create policy travel_legs_delete on trip.travel_legs for delete to authenticated
  using (trip_private.can_edit_trip(trip_id));
