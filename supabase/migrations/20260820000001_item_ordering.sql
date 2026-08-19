-- 일정 순서 재배치
--
-- sort_order 는 numeric 이고 1000 간격으로 배치한다. 중간 삽입은 양옆 값의
-- 중간값을 쓴다. numeric 은 임의 정밀도라 중간값이 고갈되지 않지만, 반복
-- 삽입으로 자릿수가 계속 늘면 인덱스와 비교 비용이 나빠진다. 인접 값의 차이가
-- 임계값 미만이 되면 해당 날짜만 재번호화한다.
--
-- 이 계산을 클라이언트에서 하면 안 된다. 이웃을 읽고 → 중간값을 계산하고 →
-- 쓰는 사이에 다른 사람이 같은 위치로 항목을 옮기면 두 항목이 같은
-- sort_order 를 갖는다. 한 번의 원자적 호출로 처리한다.

-- 여행 시간대 기준의 날짜. 항목을 어느 Day 에 넣을지 판정하는 기준이다.
-- UTC 기준으로 자르면 시차만큼 날짜가 밀린다.
create or replace function trip_private.item_day(p_start_at timestamptz, p_timezone text)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_start_at at time zone p_timezone)::date;
$$;

grant execute on function trip_private.item_day(timestamptz, text) to authenticated;

-- 간격이 이 값 미만으로 좁아지면 재번호화한다.
create or replace function trip_private.sort_order_gap_floor()
returns numeric
language sql
immutable
set search_path = ''
as $$
  select 0.000001::numeric;
$$;

grant execute on function trip_private.sort_order_gap_floor() to authenticated;

-- 한 날짜의 항목을 1000 간격으로 다시 번호 매긴다.
-- 잠금 구간을 짧게 유지하려고 여행 전체가 아니라 하루만 대상으로 한다.
create or replace function trip_private.rebalance_day(p_trip_id uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
begin
  select t.timezone into v_timezone
  from trip.trips t
  where t.id = p_trip_id;

  if v_timezone is null then
    return;
  end if;

  with ordered as (
    select
      i.id,
      row_number() over (order by i.start_at, i.sort_order, i.id) as position
    from trip.itinerary_items i
    where i.trip_id = p_trip_id
      and i.deleted_at is null
      and trip_private.item_day(i.start_at, v_timezone) = p_day
  )
  update trip.itinerary_items i
  set sort_order = ordered.position * 1000
  from ordered
  where i.id = ordered.id;
end;
$$;

revoke all on function trip_private.rebalance_day(uuid, date) from public, anon;
grant execute on function trip_private.rebalance_day(uuid, date) to authenticated;

-- 항목을 특정 시각과 순서로 옮긴다.
--
-- p_after_item_id 가 null 이면 그 날짜의 맨 앞에 놓는다.
-- 반환값은 새로 계산된 sort_order.
--
-- SECURITY INVOKER(기본)이므로 RLS 가 그대로 적용된다. 편집 권한이 없는
-- 사용자의 UPDATE 는 0행으로 끝나고 아래에서 예외가 된다.
create or replace function trip.move_item(
  p_item_id       uuid,
  p_start_at      timestamptz,
  p_after_item_id uuid default null
)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_trip_id  uuid;
  v_timezone text;
  v_day      date;
  v_prev     numeric;
  v_next     numeric;
  v_new      numeric;
  v_updated  integer;
begin
  -- RLS 가 적용되므로 볼 수 없는 항목은 여기서 걸린다.
  select i.trip_id into v_trip_id
  from trip.itinerary_items i
  where i.id = p_item_id
    and i.deleted_at is null;

  if v_trip_id is null then
    raise exception 'itinerary item not found or not visible: %', p_item_id
      using errcode = 'no_data_found';
  end if;

  select t.timezone into v_timezone
  from trip.trips t
  where t.id = v_trip_id;

  v_day := trip_private.item_day(p_start_at, v_timezone);

  if p_after_item_id is not null then
    select i.sort_order into v_prev
    from trip.itinerary_items i
    where i.id = p_after_item_id
      and i.trip_id = v_trip_id
      and i.deleted_at is null
      and trip_private.item_day(i.start_at, v_timezone) = v_day;

    if v_prev is null then
      raise exception 'anchor item % is not on the same day', p_after_item_id
        using errcode = 'invalid_parameter_value';
    end if;
  end if;

  -- 같은 날짜에서 기준 항목 바로 다음에 오는 항목.
  -- 옮기는 항목 자신은 제외한다 (자기 자신을 이웃으로 잡으면 값이 수렴한다).
  select min(i.sort_order) into v_next
  from trip.itinerary_items i
  where i.trip_id = v_trip_id
    and i.id <> p_item_id
    and i.deleted_at is null
    and trip_private.item_day(i.start_at, v_timezone) = v_day
    and (v_prev is null or i.sort_order > v_prev);

  if v_prev is null and v_next is null then
    v_new := 1000;
  elsif v_prev is null then
    v_new := v_next / 2;
  elsif v_next is null then
    v_new := v_prev + 1000;
  else
    -- 간격이 바닥나면 그 날짜만 재번호화하고 다시 계산한다.
    if v_next - v_prev < trip_private.sort_order_gap_floor() then
      perform trip_private.rebalance_day(v_trip_id, v_day);

      select i.sort_order into v_prev
      from trip.itinerary_items i
      where i.id = p_after_item_id;

      select min(i.sort_order) into v_next
      from trip.itinerary_items i
      where i.trip_id = v_trip_id
        and i.id <> p_item_id
        and i.deleted_at is null
        and trip_private.item_day(i.start_at, v_timezone) = v_day
        and i.sort_order > v_prev;
    end if;

    v_new := case when v_next is null then v_prev + 1000 else (v_prev + v_next) / 2 end;
  end if;

  update trip.itinerary_items
  set start_at   = p_start_at,
      sort_order = v_new
  where id = p_item_id
    and deleted_at is null;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    -- SELECT 는 통과했지만 UPDATE 정책에 막힌 경우 (viewer)
    raise exception 'not allowed to move item %', p_item_id
      using errcode = 'insufficient_privilege';
  end if;

  return v_new;
end;
$$;

grant execute on function trip.move_item(uuid, timestamptz, uuid) to authenticated;

-- 새 항목을 그 날짜 맨 뒤에 붙일 때 쓸 sort_order.
create or replace function trip.next_sort_order(p_trip_id uuid, p_start_at timestamptz)
returns numeric
language plpgsql
stable
set search_path = ''
as $$
declare
  v_timezone text;
  v_max      numeric;
begin
  select t.timezone into v_timezone
  from trip.trips t
  where t.id = p_trip_id;

  if v_timezone is null then
    raise exception 'trip not found or not visible: %', p_trip_id
      using errcode = 'no_data_found';
  end if;

  select max(i.sort_order) into v_max
  from trip.itinerary_items i
  where i.trip_id = p_trip_id
    and i.deleted_at is null
    and trip_private.item_day(i.start_at, v_timezone)
        = trip_private.item_day(p_start_at, v_timezone);

  return coalesce(v_max, 0) + 1000;
end;
$$;

grant execute on function trip.next_sort_order(uuid, timestamptz) to authenticated;
