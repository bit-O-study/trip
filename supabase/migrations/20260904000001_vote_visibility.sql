-- 투표가 끝난 뒤에도 득표 수를 볼 수 있게 한다.
--
-- 이전 정책은 SELECT 에도 `can_vote_for_item()` 을 그대로 썼다. 그 함수는
-- "지금 이 후보에 투표할 수 있는가" 를 묻기 때문에 후보 상태(candidate)와
-- 투표 진행 여부(open, closes_at > now())를 함께 요구한다.
--
-- 그래서 투표가 확정되는 순간 — 1위는 confirmed, 나머지는 cancelled, 투표는
-- finalized 가 되면서 — **모든 표가 한꺼번에 안 보이게 됐다.** 화면에는
-- "투표 종료 · 일정 확정" 인데 1위가 0표로 찍혔다.
--
-- 쓰기 조건과 읽기 조건은 다르다. 쓰기는 "지금 투표할 수 있는가", 읽기는
-- "이 여행의 멤버인가" 다. 함수를 갈라 둔다.
create or replace function trip_private.can_read_restaurant_votes(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from trip.itinerary_items i
    join trip.trip_members m on m.trip_id = i.trip_id
    where i.id = p_item_id
      and i.restaurant_poll_id is not null
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function trip_private.can_read_restaurant_votes(uuid) from public, anon;
grant execute on function trip_private.can_read_restaurant_votes(uuid) to authenticated, service_role;

drop policy if exists restaurant_votes_select on trip.restaurant_votes;
create policy restaurant_votes_select on trip.restaurant_votes
  for select to authenticated
  using (trip_private.can_read_restaurant_votes(item_id));
