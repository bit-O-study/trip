-- 스키마와 열거형
--
-- private 스키마는 PostgREST에 노출되지 않는다(노출 스키마는 public 뿐).
-- SECURITY DEFINER 헬퍼를 여기에 두면 RPC로 직접 호출될 수 없다.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
-- RLS 정책이 헬퍼를 호출하려면 질의를 실행하는 역할에 USAGE가 필요하다.
-- 스키마가 노출되지 않으므로 API 표면은 늘어나지 않는다.
grant usage on schema private to authenticated, service_role;

-- 값 집합이 닫혀 있고 잘 바뀌지 않는 것만 enum으로 둔다.
-- 공급자 이름처럼 늘어날 값은 text + check 로 둬서 마이그레이션 부담을 줄인다.

create type public.trip_member_role as enum ('owner', 'editor', 'viewer');

create type public.trip_status as enum ('planning', 'ongoing', 'completed');

create type public.itinerary_item_type as enum (
  'flight', 'lodging', 'food', 'activity', 'transport', 'memo'
);

create type public.itinerary_item_status as enum (
  'confirmed', 'tentative', 'candidate', 'cancelled'
);

create type public.itinerary_item_source as enum (
  'kakao', 'flight_api', 'manual', 'imported'
);

-- 공개 공유 링크에서의 노출 여부만 제어한다.
-- hidden 이어도 여행 멤버에게는 항상 보인다. 멤버에게도 비공개인 개인 메모는
-- 별도 테이블(item_private_notes, Phase 2)로 분리한다.
create type public.share_visibility as enum ('visible', 'hidden');

create type public.place_category_group as enum (
  'food', 'cafe', 'lodging', 'attraction', 'shopping', 'transport', 'etc'
);

create type public.flight_status as enum (
  'scheduled', 'delayed', 'boarding', 'departed', 'landed', 'cancelled',
  'diverted', 'unknown'
);
