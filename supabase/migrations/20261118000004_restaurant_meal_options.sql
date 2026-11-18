alter table trip.saved_restaurants add column if not exists candidate_date date;
alter table trip.saved_restaurants add column if not exists candidate_meal text;
drop policy if exists saved_restaurants_read on trip.saved_restaurants;
create policy saved_restaurants_read on trip.saved_restaurants for select to authenticated
 using (trip_private.is_trip_member(trip_id) and exists(select 1 from trip.trips t where t.id=trip_id and t.deleted_at is null));
do $$ begin
if not exists(select 1 from pg_constraint where conrelid='trip.saved_restaurants'::regclass and conname='saved_restaurants_candidate_slot') then
alter table trip.saved_restaurants add constraint saved_restaurants_candidate_slot
 check ((candidate_date is null and candidate_meal is null) or
 (candidate_date is not null and candidate_meal is not null and candidate_meal in ('아침','점심','저녁','간식')));
end if;
end $$;

create or replace function trip.set_restaurant_candidate(p_trip_id uuid, p_id uuid, p_expected timestamptz, p_date date, p_meal text)
returns uuid language plpgsql security definer set search_path='' as $$
declare t trip.trips%rowtype; result uuid;
begin
 if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then raise exception 'No edit permission' using errcode='42501'; end if;
 select * into t from trip.trips where id=p_trip_id and deleted_at is null for share;
 if not found then raise exception 'Trip not found' using errcode='42501'; end if;
 if (p_date is null) <> (p_meal is null) or (p_date is not null and
   (p_date not between t.start_date and t.end_date or p_meal not in ('아침','점심','저녁','간식'))) then
  raise exception 'Invalid meal slot' using errcode='22023';
 end if;
 update trip.saved_restaurants set candidate_date=p_date,candidate_meal=p_meal
  where id=p_id and trip_id=p_trip_id and updated_at=p_expected returning id into result;
 if result is null then raise exception 'Restaurant changed' using errcode='40001'; end if;
 return result;
end $$;
revoke all on function trip.set_restaurant_candidate(uuid,uuid,timestamptz,date,text) from public,anon;
grant execute on function trip.set_restaurant_candidate(uuid,uuid,timestamptz,date,text) to authenticated;

-- Keep the original itinerary as a soft-deleted record, including its reservation/attachments.
-- A replacement gets its own item and the same time window; restaurant-specific details are not copied.
create or replace function trip.replace_restaurant_meal(p_trip_id uuid, p_candidate_id uuid, p_candidate_expected timestamptz,
 p_scheduled_id uuid, p_scheduled_expected timestamptz, p_item_expected timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare t trip.trips%rowtype; candidate trip.saved_restaurants%rowtype; scheduled trip.saved_restaurants%rowtype;
 i trip.itinerary_items%rowtype; item uuid; meal_date date;
begin
 if auth.uid() is null or not trip_private.can_edit_trip(p_trip_id) then raise exception 'No edit permission' using errcode='42501'; end if;
 select * into t from trip.trips where id=p_trip_id and deleted_at is null for update;
 if not found then raise exception 'Trip not found' using errcode='42501'; end if;
 if p_candidate_id=p_scheduled_id then raise exception 'Choose another restaurant' using errcode='22023'; end if;
 select * into candidate from trip.saved_restaurants where id=p_candidate_id and trip_id=p_trip_id for update;
 if not found or candidate.updated_at is distinct from p_candidate_expected then raise exception 'Candidate changed' using errcode='40001'; end if;
 select * into scheduled from trip.saved_restaurants where id=p_scheduled_id and trip_id=p_trip_id for update;
 if not found or scheduled.updated_at is distinct from p_scheduled_expected then raise exception 'Restaurant changed' using errcode='40001'; end if;
 if exists(select 1 from trip.itinerary_items where id=candidate.item_id and deleted_at is null and status <> 'cancelled') then
  raise exception 'Candidate already scheduled' using errcode='22023';
 end if;
 select * into i from trip.itinerary_items where id=scheduled.item_id and trip_id=p_trip_id and deleted_at is null and status <> 'cancelled' for update;
 if not found or i.updated_at is distinct from p_item_expected then raise exception 'Itinerary changed' using errcode='40001'; end if;
 meal_date := (i.start_at at time zone t.timezone)::date;
 if i.type <> 'food' or i.all_day or scheduled.meal is null or meal_date not between t.start_date and t.end_date
   or candidate.candidate_date is distinct from meal_date or candidate.candidate_meal is distinct from scheduled.meal then
  raise exception 'Meal slot mismatch' using errcode='22023';
 end if;
 insert into trip.itinerary_items(trip_id,created_by,type,title,start_at,end_at,timezone,status,source,note,location_text,sort_order,place_snapshot,share_visibility)
 values(p_trip_id,auth.uid(),'food',candidate.name || case when candidate.original_name='' then '' else '('||candidate.original_name||')' end || ' · ' || scheduled.meal,
  i.start_at,i.end_at,i.timezone,'confirmed','manual',nullif(candidate.note,''),nullif(candidate.address,''),i.sort_order,
  case when candidate.latitude is null then null else jsonb_build_object('name',candidate.name,'latitude',candidate.latitude,'longitude',candidate.longitude,'selected',true,'estimated',false) end,i.share_visibility)
 returning id into item;
 update trip.itinerary_items set deleted_at=now() where id=i.id;
 update trip.saved_restaurants set item_id=null,meal=null,candidate_date=meal_date,candidate_meal=scheduled.meal where id=scheduled.id;
 update trip.saved_restaurants set item_id=item,meal=scheduled.meal where id=candidate.id;
 return item;
end $$;
revoke all on function trip.replace_restaurant_meal(uuid,uuid,timestamptz,uuid,timestamptz,timestamptz) from public,anon;
grant execute on function trip.replace_restaurant_meal(uuid,uuid,timestamptz,uuid,timestamptz,timestamptz) to authenticated;
