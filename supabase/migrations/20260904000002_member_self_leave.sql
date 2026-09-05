-- 참여자가 스스로 여행에서 나갈 수 있게 한다.
--
-- `trip_members_delete` 는 owner 만 허용한다. 초대를 잘못 수락했거나 더 이상
-- 같이 가지 않는 사람이 스스로 빠져나올 방법이 없어, owner 에게 부탁하는 것이
-- 유일한 경로였다.
--
-- 지울 수 있는 것은 **자기 행 하나**뿐이다. 마지막 owner 의 이탈은 기존
-- `guard_last_owner` 트리거가 그대로 막는다 — 정책을 넓혀도 여행이 고아가
-- 되지는 않는다.
drop policy if exists trip_members_delete_self on trip.trip_members;
create policy trip_members_delete_self on trip.trip_members
  for delete to authenticated
  using (user_id = (select auth.uid()));
