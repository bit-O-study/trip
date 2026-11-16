-- A saved restaurant survives removal from the itinerary. Writes and scheduling
-- are atomic RPC operations; clients cannot assign arbitrary itinerary links.
create table if not exists trip.saved_restaurants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip.trips(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  original_name text not null default '' check (length(original_name) <= 100),
  region text not null check (length(btrim(region)) between 1 and 80),
  menu text not null default '' check (length(menu) <= 200),
  note text not null default '' check (length(note) <= 2000),
  address text not null default '' check (length(address) <= 300),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  item_id uuid unique references trip.itinerary_items(id) on delete set null,
  meal text check (meal in ('아침','점심','저녁','간식')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null) = (longitude is null))
);
create index if not exists saved_restaurants_trip_idx on trip.saved_restaurants(trip_id);
alter table trip.saved_restaurants enable row level security;
revoke all on trip.saved_restaurants from anon, authenticated;
grant select on trip.saved_restaurants to authenticated;
grant all on trip.saved_restaurants to service_role;
drop policy if exists saved_restaurants_read on trip.saved_restaurants;
create policy saved_restaurants_read on trip.saved_restaurants for select to authenticated
  using (trip_private.is_trip_member(trip_id));
drop trigger if exists saved_restaurants_updated_at on trip.saved_restaurants;
create trigger saved_restaurants_updated_at before update on trip.saved_restaurants
  for each row execute function trip_private.set_updated_at();

create or replace function trip.manage_saved_restaurant(
  p_trip_id uuid, p_action text, p_id uuid default null,
  p_expected timestamptz default null, p_data jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r trip.saved_restaurants%rowtype;
  t trip.trips%rowtype;
  i trip.itinerary_items%rowtype;
  stamp timestamptz;
  finish timestamptz;
  item uuid;
  label text;
begin
  if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then
    raise exception '편집 권한이 없습니다.' using errcode='42501';
  end if;
  select * into t from trip.trips where id=p_trip_id and deleted_at is null for share;
  if not found then raise exception '여행을 찾을 수 없습니다.'; end if;
  if p_action not in ('save','schedule','unschedule','delete') or p_action is null then
    raise exception '잘못된 요청입니다.';
  end if;
  if p_id is not null then
    select * into r from trip.saved_restaurants where id=p_id and trip_id=p_trip_id for update;
    if not found then raise exception '맛집을 찾을 수 없습니다.'; end if;
    if p_expected is distinct from r.updated_at then
      raise exception '다른 곳에서 수정되었습니다. 새로고침 후 다시 시도하세요.' using errcode='40001';
    end if;
  elsif p_action <> 'save' then raise exception '맛집을 선택하세요.';
  end if;

  if p_action='save' then
    if p_id is null then
      insert into trip.saved_restaurants(trip_id,name,region) values(p_trip_id,p_data->>'name',p_data->>'region') returning * into r;
    end if;
    update trip.saved_restaurants set
      name=btrim(p_data->>'name'), original_name=coalesce(btrim(p_data->>'originalName'),''),
      region=btrim(p_data->>'region'), menu=coalesce(p_data->>'menu',''), note=coalesce(p_data->>'note',''),
      address=coalesce(p_data->>'address',''), latitude=(p_data->>'latitude')::double precision,
      longitude=(p_data->>'longitude')::double precision
    where id=r.id;
    return r.id;
  end if;
  if p_action='delete' then
    delete from trip.saved_restaurants where id=r.id;
    return r.id; -- Scheduled itinerary deliberately remains.
  end if;
  if r.item_id is not null then
    select * into i from trip.itinerary_items where id=r.item_id and trip_id=p_trip_id for update;
    if found and i.deleted_at is null then
      if (p_data->>'itemUpdatedAt')::timestamptz is distinct from i.updated_at then
        raise exception '일정이 수정되었습니다. 새로고침 후 다시 시도하세요.' using errcode='40001';
      end if;
      item := i.id;
    end if;
  end if;
  if p_action='unschedule' then
    if item is not null then update trip.itinerary_items set deleted_at=now() where id=item; end if;
    update trip.saved_restaurants set item_id=null,meal=null where id=r.id;
    return r.id;
  end if;
  if p_data->>'meal' is null or p_data->>'meal' not in ('아침','점심','저녁','간식') then raise exception '식사 구분을 선택하세요.'; end if;
  stamp := (p_data->>'startAt')::timestamptz;
  if stamp is null or not isfinite(stamp) or (stamp at time zone t.timezone)::date not between t.start_date and t.end_date then
    raise exception '여행 기간 안의 날짜를 선택하세요.';
  end if;
  label := r.name || case when r.original_name='' then '' else '('||r.original_name||')' end || ' · ' || (p_data->>'meal');
  if item is null then
    insert into trip.itinerary_items(trip_id,created_by,type,title,start_at,timezone,status,source,note,location_text,sort_order,place_snapshot)
    values(p_trip_id,auth.uid(),'food',label,stamp,t.timezone,'confirmed','manual',nullif(r.note,''),nullif(r.address,''),
      trip.next_sort_order(p_trip_id,stamp),
      case when r.latitude is null then null else jsonb_build_object('name',r.name,'latitude',r.latitude,'longitude',r.longitude,'selected',true,'estimated',false) end)
    returning id into item;
  else
    finish := case when i.end_at is null then null else stamp+(i.end_at-i.start_at) end;
    update trip.itinerary_items set start_at=stamp,end_at=finish,title=label,status='confirmed',all_day=false,
      timezone=t.timezone,sort_order=trip.next_sort_order(p_trip_id,stamp) where id=item;
  end if;
  update trip.saved_restaurants set item_id=item,meal=p_data->>'meal' where id=r.id;
  return r.id;
end;
$$;
revoke all on function trip.manage_saved_restaurant(uuid,text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function trip.manage_saved_restaurant(uuid,text,uuid,timestamptz,jsonb) to authenticated;
notify pgrst, 'reload schema';
