-- Row Level Security
--
-- RLS 만으로는 부족하다. PostgREST 는 역할의 테이블 권한(GRANT)도 확인하므로
-- 정책과 권한을 함께 정의한다. 권한을 넓게 주고 정책으로만 막으면 정책 하나를
-- 빠뜨렸을 때 그대로 열린다. 그래서 필요한 권한만 명시적으로 준다.
--
-- service_role 은 BYPASSRLS 이므로 정책이 적용되지 않는다. 공유 링크처럼 RLS
-- 우회가 필요한 경로만 service_role 을 쓰고, 그 사용처는 서버 모듈 한 곳에
-- 격리한다(docs/architecture.md 6절).

-- 권한은 필요한 Trip 테이블에만 명시적으로 부여한다.

alter table trip.trips             enable row level security;
alter table trip.profiles          enable row level security;
alter table trip.trip_members      enable row level security;
alter table trip.trip_invites      enable row level security;
alter table trip.trip_share_links  enable row level security;
alter table trip.places            enable row level security;
alter table trip.flights           enable row level security;
alter table trip.itinerary_items   enable row level security;
alter table trip.attachments       enable row level security;
alter table trip.audit_events      enable row level security;

grant all on all tables in schema trip to service_role;

grant select, insert, update on trip.profiles to authenticated;

drop policy if exists profiles_select on trip.profiles;
create policy profiles_select on trip.profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or trip_private.shares_trip_with(user_id));

drop policy if exists profiles_insert on trip.profiles;
create policy profiles_insert on trip.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_update on trip.profiles;
create policy profiles_update on trip.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- trips
--
-- soft delete 된 여행도 조회 가능하게 둔다. 휴지통에서 복구하려면 읽을 수
-- 있어야 하기 때문이다. 목록에서 제외하는 것은 애플리케이션 질의의 책임이다.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on trip.trips to authenticated;

-- owner_id 조건이 먼저 오는 것이 중요하다.
-- INSERT ... RETURNING 은 RETURNING 을 계산할 때 SELECT 정책도 통과해야 하는데,
-- 생성자를 owner 멤버로 등록하는 AFTER 트리거는 그 시점 이후에 실행된다.
-- is_trip_member 만 두면 "여행을 만들고 id 를 돌려받는" 기본 흐름이 실패한다.
-- 부수 효과로 trip_members 행이 유실돼도 소유자가 자기 여행에서 잠기지 않는다.
drop policy if exists trips_select on trip.trips;
create policy trips_select on trip.trips
  for select to authenticated
  using (owner_id = (select auth.uid()) or trip_private.is_trip_member(id));

drop policy if exists trips_insert on trip.trips;
create policy trips_insert on trip.trips
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists trips_update on trip.trips;
create policy trips_update on trip.trips
  for update to authenticated
  using (trip_private.can_edit_trip(id))
  with check (trip_private.can_edit_trip(id));

-- 물리 삭제는 owner 만. 일반 경로는 deleted_at 을 채우는 UPDATE 다.
drop policy if exists trips_delete on trip.trips;
create policy trips_delete on trip.trips
  for delete to authenticated
  using (trip_private.is_trip_owner(id));

-- ---------------------------------------------------------------------------
-- trip_members
--
-- 정책이 trip_members 를 직접 서브쿼리로 참조하면 자기 정책과 재귀한다.
-- 반드시 private 헬퍼를 거친다.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on trip.trip_members to authenticated;

drop policy if exists trip_members_select on trip.trip_members;
create policy trip_members_select on trip.trip_members
  for select to authenticated
  using (trip_private.is_trip_member(trip_id));

drop policy if exists trip_members_insert on trip.trip_members;
create policy trip_members_insert on trip.trip_members
  for insert to authenticated
  with check (trip_private.is_trip_owner(trip_id));

drop policy if exists trip_members_update on trip.trip_members;
create policy trip_members_update on trip.trip_members
  for update to authenticated
  using (trip_private.is_trip_owner(trip_id))
  with check (trip_private.is_trip_owner(trip_id));

drop policy if exists trip_members_delete on trip.trip_members;
create policy trip_members_delete on trip.trip_members
  for delete to authenticated
  using (trip_private.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- trip_invites / trip_share_links
--
-- token_hash 가 들어 있으므로 owner 에게만 노출한다. 토큰 검증은 service_role 을
-- 쓰는 서버 경로에서만 수행한다.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on trip.trip_invites to authenticated;

drop policy if exists trip_invites_all on trip.trip_invites;
create policy trip_invites_all on trip.trip_invites
  for all to authenticated
  using (trip_private.is_trip_owner(trip_id))
  with check (trip_private.is_trip_owner(trip_id));

grant select, insert, update, delete on trip.trip_share_links to authenticated;

drop policy if exists trip_share_links_all on trip.trip_share_links;
create policy trip_share_links_all on trip.trip_share_links
  for all to authenticated
  using (trip_private.is_trip_owner(trip_id))
  with check (trip_private.is_trip_owner(trip_id));

-- ---------------------------------------------------------------------------
-- places / flights — 공유 엔티티
--
-- 읽기와 생성은 인증 사용자에게 열되 갱신은 막는다. 한 사용자가 공유 행을
-- 바꾸면 다른 사용자가 보는 값이 달라진다. 갱신은 서버(service_role)만 한다.
-- 저장된 일정 자체는 itinerary_items 의 스냅샷이 보호한다.
-- ---------------------------------------------------------------------------
grant select, insert on trip.places to authenticated;

drop policy if exists places_select on trip.places;
create policy places_select on trip.places
  for select to authenticated
  using (true);

drop policy if exists places_insert on trip.places;
create policy places_insert on trip.places
  for insert to authenticated
  with check (true);

grant select, insert on trip.flights to authenticated;

drop policy if exists flights_select on trip.flights;
create policy flights_select on trip.flights
  for select to authenticated
  using (true);

drop policy if exists flights_insert on trip.flights;
create policy flights_insert on trip.flights
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- itinerary_items
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on trip.itinerary_items to authenticated;

drop policy if exists itinerary_items_select on trip.itinerary_items;
create policy itinerary_items_select on trip.itinerary_items
  for select to authenticated
  using (trip_private.is_trip_member(trip_id));

drop policy if exists itinerary_items_insert on trip.itinerary_items;
create policy itinerary_items_insert on trip.itinerary_items
  for insert to authenticated
  with check (trip_private.can_edit_trip(trip_id));

drop policy if exists itinerary_items_update on trip.itinerary_items;
create policy itinerary_items_update on trip.itinerary_items
  for update to authenticated
  using (trip_private.can_edit_trip(trip_id))
  with check (trip_private.can_edit_trip(trip_id));

drop policy if exists itinerary_items_delete on trip.itinerary_items;
create policy itinerary_items_delete on trip.itinerary_items
  for delete to authenticated
  using (trip_private.can_edit_trip(trip_id));

-- ---------------------------------------------------------------------------
-- attachments
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on trip.attachments to authenticated;

drop policy if exists attachments_select on trip.attachments;
create policy attachments_select on trip.attachments
  for select to authenticated
  using (trip_private.is_trip_member(trip_id));

drop policy if exists attachments_insert on trip.attachments;
create policy attachments_insert on trip.attachments
  for insert to authenticated
  with check (trip_private.can_edit_trip(trip_id));

drop policy if exists attachments_update on trip.attachments;
create policy attachments_update on trip.attachments
  for update to authenticated
  using (trip_private.can_edit_trip(trip_id))
  with check (trip_private.can_edit_trip(trip_id));

drop policy if exists attachments_delete on trip.attachments;
create policy attachments_delete on trip.attachments
  for delete to authenticated
  using (trip_private.can_edit_trip(trip_id));

-- ---------------------------------------------------------------------------
-- audit_events
--
-- 읽기는 owner 만. 쓰기 정책은 두지 않는다 — 일반 사용자가 감사 기록을 만들거나
-- 고칠 수 있으면 기록을 신뢰할 수 없다. 생성은 SECURITY DEFINER 트리거가 한다.
-- ---------------------------------------------------------------------------
grant select on trip.audit_events to authenticated;

drop policy if exists audit_events_select on trip.audit_events;
create policy audit_events_select on trip.audit_events
  for select to authenticated
  using (trip_private.is_trip_owner(trip_id));
