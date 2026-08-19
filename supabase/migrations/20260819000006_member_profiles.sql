-- 동행자 표시 이름
--
-- 계정을 헬쑤와 공유하므로 표시 이름도 헬쑤의 public.profiles 를 쓴다.
-- 다만 그 테이블에 정책을 추가하는 방식은 쓰지 않는다.
--
-- 이유: RLS 는 행 단위라 컬럼을 가릴 수 없다. public.profiles 에
-- "같은 여행 멤버끼리 읽을 수 있다" 정책을 추가하면 동행자가 상대의
-- 전화번호·체중·체지방률·목표·정지 사유까지 전부 읽게 된다.
-- 여행 앱이 알아야 하는 것은 표시 이름 하나뿐이다.
--
-- 대신 trip 스키마에 필요한 컬럼만 내보내는 뷰를 둔다.
--
--   - 헬쑤의 테이블·정책·권한을 전혀 건드리지 않는다. 되돌리려면 이 뷰만 지우면 된다.
--   - 뷰는 소유자(postgres) 권한으로 실행되므로 헬쑤의 "본인 행만" 정책을
--     우회한다. 그래서 접근 통제를 WHERE 절에서 직접 한다.
--     security_barrier 를 켜서 조건이 먼저 평가되도록 강제한다.
--   - 컬럼이 두 개뿐이라 나중에 헬쑤가 컬럼을 추가해도 새어 나가지 않는다.
--
-- Supabase 린터가 "security definer view" 경고를 낼 수 있다. 의도된 것이다.

create or replace view trip.member_profiles
with (security_barrier = true) as
select
  p.user_id,
  -- 닉네임 우선, 없으면 이름. 헬쑤의 표시 규칙과 같다.
  -- 둘 다 비면 null 을 주고 표시 문구는 앱이 정한다.
  coalesce(
    nullif(btrim(p.nickname), ''),
    nullif(btrim(p.name), '')
  ) as display_name
from public.profiles p
where
  -- 본인
  p.user_id = (select auth.uid())
  -- 또는 같은 여행에 속한 사람
  or trip_private.shares_trip_with(p.user_id);

comment on view trip.member_profiles is
  '헬쑤 public.profiles 에서 표시 이름만 노출한다. 여행 동행자와 본인만 조회 가능. '
  '컬럼을 추가할 때는 그 값이 동행자에게 보여도 되는지 먼저 판단할 것.';

revoke all on trip.member_profiles from public, anon;
grant select on trip.member_profiles to authenticated, service_role;
