-- 투표 생성자는 현재 여행 역할이 viewer 로 바뀌어도 자신이 만든 투표를 삭제할 수 있다.
-- 연결된 후보/확정 일정은 같은 트랜잭션에서 soft delete 한다.
create or replace function trip.delete_own_restaurant_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_user_id uuid;
begin
  -- Supabase/PostgREST 버전에 따라 JWT가 개별 GUC 또는 JSON GUC로 들어온다.
  -- auth.uid()를 우선 사용하고 두 표현을 fallback으로 읽는다.
  v_user_id := coalesce(
    (select auth.uid()),
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  );

  select p.trip_id into v_trip_id
  from trip.restaurant_polls p
  where p.id = p_poll_id
    and p.created_by = v_user_id
  for update;

  if v_trip_id is null then
    return false;
  end if;

  update trip.itinerary_items
  set deleted_at = coalesce(deleted_at, now())
  where restaurant_poll_id = p_poll_id;

  delete from trip.restaurant_polls where id = p_poll_id;
  return true;
end;
$$;

revoke all on function trip.delete_own_restaurant_poll(uuid) from public, anon;
grant execute on function trip.delete_own_restaurant_poll(uuid) to authenticated, service_role;

-- 시작 시각을 옮길 때 종료 시각도 같은 간격만큼 이동해 end_at > start_at 을 보존한다.
create or replace function trip.move_item(
  p_item_id uuid,
  p_start_at timestamptz,
  p_after_item_id uuid default null
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_timezone text;
  v_day date;
  v_prev numeric;
  v_next numeric;
  v_new numeric;
  v_updated integer;
begin
  select i.trip_id into v_trip_id
  from trip.itinerary_items i
  where i.id = p_item_id and i.deleted_at is null;

  if v_trip_id is null then
    raise exception 'itinerary item not found or not visible: %', p_item_id using errcode = 'no_data_found';
  end if;

  select t.timezone into v_timezone from trip.trips t where t.id = v_trip_id;
  v_day := trip_private.item_day(p_start_at, v_timezone);

  if p_after_item_id is not null then
    select i.sort_order into v_prev
    from trip.itinerary_items i
    where i.id = p_after_item_id and i.trip_id = v_trip_id and i.deleted_at is null
      and trip_private.item_day(i.start_at, v_timezone) = v_day;
    if v_prev is null then
      raise exception 'anchor item % is not on the same day', p_after_item_id using errcode = 'invalid_parameter_value';
    end if;
  end if;

  select min(i.sort_order) into v_next
  from trip.itinerary_items i
  where i.trip_id = v_trip_id and i.id <> p_item_id and i.deleted_at is null
    and trip_private.item_day(i.start_at, v_timezone) = v_day
    and (v_prev is null or i.sort_order > v_prev);

  if v_prev is null and v_next is null then
    v_new := 1000;
  elsif v_prev is null then
    v_new := v_next / 2;
  elsif v_next is null then
    v_new := v_prev + 1000;
  else
    if v_next - v_prev < trip_private.sort_order_gap_floor() then
      perform trip_private.rebalance_day(v_trip_id, v_day);
      select i.sort_order into v_prev from trip.itinerary_items i where i.id = p_after_item_id;
      select min(i.sort_order) into v_next
      from trip.itinerary_items i
      where i.trip_id = v_trip_id and i.id <> p_item_id and i.deleted_at is null
        and trip_private.item_day(i.start_at, v_timezone) = v_day and i.sort_order > v_prev;
    end if;
    v_new := case when v_next is null then v_prev + 1000 else (v_prev + v_next) / 2 end;
  end if;

  update trip.itinerary_items
  set end_at = case when end_at is null then null else end_at + (p_start_at - start_at) end,
      start_at = p_start_at,
      sort_order = v_new
  where id = p_item_id and deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'not allowed to move item %', p_item_id using errcode = 'insufficient_privilege';
  end if;
  return v_new;
end;
$$;

grant execute on function trip.move_item(uuid, timestamptz, uuid) to authenticated;
