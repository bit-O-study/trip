-- 보안 점검(2026-10-23) 대응 2/2 — 옛 앱이 쓰던 경로를 닫는다
--
-- ⚠ 적용 순서: 20261023000001 적용 → 새 앱 배포(save_place / save_flight /
--   finalize_due_restaurant_polls_for_trip 사용) → 이 파일 적용.
--   옛 앱이 떠 있는 동안 이 파일을 먼저 적용하면 장소·항공편 추가와 투표 화면
--   열기가 실패한다.

-- ---------------------------------------------------------------------------
-- 전역 마감 함수는 cron / service_role 전용 (P9)
--
-- 아무 로그인 사용자나 모든 여행의 투표를 마감할 수 있었다. 화면은 여행별
-- 함수(finalize_due_restaurant_polls_for_trip)를 쓴다.
-- ---------------------------------------------------------------------------
revoke execute on function trip.finalize_due_restaurant_polls() from public, anon, authenticated;
grant execute on function trip.finalize_due_restaurant_polls() to service_role;

-- ---------------------------------------------------------------------------
-- flights / places (P11)
--
-- 모든 로그인 사용자가 전 세계 사용자의 항공편(편명·날짜)을 열람하고, 인기
-- 장소를 가짜 상호·javascript: URL 로 먼저 등록해 둘 수 있었다.
-- 쓰기는 편집 권한을 확인하는 trip.save_place / trip.save_flight 로만,
-- 읽기는 내가 속한 여행의 일정이 참조하는 행만.
-- ---------------------------------------------------------------------------
drop policy if exists places_insert on trip.places;
drop policy if exists flights_insert on trip.flights;
revoke insert on trip.places from authenticated;
revoke insert on trip.flights from authenticated;

drop policy if exists places_select on trip.places;
create policy places_select on trip.places
  for select to authenticated
  using (trip_private.can_read_place(id));

drop policy if exists flights_select on trip.flights;
create policy flights_select on trip.flights
  for select to authenticated
  using (trip_private.can_read_flight(id));
