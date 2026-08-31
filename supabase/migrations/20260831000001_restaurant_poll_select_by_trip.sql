-- restaurant_polls 의 SELECT 정책이 자기 테이블을 id 로 되조회하고 있었다.
--
--   using (trip_private.can_access_restaurant_poll(id))
--     -> select 1 from trip.restaurant_polls p join trip.trip_members m ... where p.id = p_poll_id
--
-- 이 헬퍼는 STABLE 이라 문장 시작 시점의 스냅샷을 본다. INSERT 와 같은 문장에서는
-- 방금 넣은 행이 그 스냅샷에 없으므로 항상 false 가 되고, `insert ... returning`
-- 이 42501 로 거부됐다. 투표 생성 액션이 id 를 돌려받으려고 .select() 를 붙이는
-- 순간 기능 전체가 죽는다.
--
-- 다른 테이블은 이미 자기 행의 컬럼으로 판정한다 (itinerary_items 는
-- is_trip_member(trip_id), trips 는 owner_id = auth.uid()). 같은 형태로 맞춘다.
-- 멤버십 판정 결과는 이전과 동일하다 — 기존 헬퍼도 결국 poll.trip_id 로 조인했다.
drop policy if exists restaurant_polls_select on trip.restaurant_polls;
create policy restaurant_polls_select on trip.restaurant_polls
  for select to authenticated
  using (trip_private.is_trip_member(trip_id));

-- 이 헬퍼를 쓰는 정책이 더는 없다. 남겨 두면 같은 함정을 다시 밟는다.
-- UPDATE/DELETE 가 쓰는 can_edit_restaurant_poll 은 이미 존재하는 행에만
-- 적용되므로 스냅샷 문제가 없다. 그대로 둔다.
drop function if exists trip_private.can_access_restaurant_poll(uuid);
