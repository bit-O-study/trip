-- 스키마와 열거형
--
-- 이 데이터베이스는 다른 앱(헬쑤)과 공유한다. auth.users 를 공유해 계정을
-- 함께 쓰는 것이 목적이지만, 애플리케이션 테이블까지 섞이면 안 된다.
--
--   - public 에 테이블을 만들지 않는다. profiles 같은 흔한 이름이 충돌하고,
--     "schema public 전체" 를 대상으로 하는 GRANT/REVOKE 가 상대 앱의 권한까지
--     건드린다.
--   - 앱 테이블은 trip 스키마에, SECURITY DEFINER 헬퍼는 trip_private 에 둔다.
--   - 문제가 생겨도 drop schema trip cascade 로 우리 것만 되돌릴 수 있다.
--
-- trip 스키마를 API 로 쓰려면 Supabase 대시보드에서 노출 스키마에 추가해야 한다
-- (Settings → API → Exposed schemas). 자세한 절차는 supabase/README.md 참고.

create schema if not exists trip;

revoke all on schema trip from public;
revoke all on schema trip from anon;
grant usage on schema trip to authenticated, service_role;

-- trip_private 는 노출 스키마에 넣지 않는다. 헬퍼를 RPC 로 직접 호출할 수 없게
-- 하기 위한 것이다. 다만 RLS 정책이 헬퍼를 호출하려면 질의를 실행하는 역할에
-- USAGE 가 필요하므로 authenticated 에는 준다.
create schema if not exists trip_private;

revoke all on schema trip_private from public;
revoke all on schema trip_private from anon;
grant usage on schema trip_private to authenticated, service_role;

-- 값 집합이 닫혀 있고 잘 바뀌지 않는 것만 enum으로 둔다.
-- 공급자 이름처럼 늘어날 값은 text + check 로 둬서 마이그레이션 부담을 줄인다.

create type trip.trip_member_role as enum ('owner', 'editor', 'viewer');

create type trip.trip_status as enum ('planning', 'ongoing', 'completed');

create type trip.itinerary_item_type as enum (
  'flight', 'lodging', 'food', 'activity', 'transport', 'memo'
);

create type trip.itinerary_item_status as enum (
  'confirmed', 'tentative', 'candidate', 'cancelled'
);

create type trip.itinerary_item_source as enum (
  'kakao', 'flight_api', 'manual', 'imported'
);

-- 공개 공유 링크에서의 노출 여부만 제어한다.
-- hidden 이어도 여행 멤버에게는 항상 보인다. 멤버에게도 비공개인 개인 메모는
-- 별도 테이블(item_private_notes, Phase 2)로 분리한다.
create type trip.share_visibility as enum ('visible', 'hidden');

create type trip.place_category_group as enum (
  'food', 'cafe', 'lodging', 'attraction', 'shopping', 'transport', 'etc'
);

create type trip.flight_status as enum (
  'scheduled', 'delayed', 'boarding', 'departed', 'landed', 'cancelled',
  'diverted', 'unknown'
);
