-- 헬퍼 함수와 트리거
--
-- 멤버십 검사를 RLS 정책 안에 직접 서브쿼리로 넣으면 trip_members 자신의
-- 정책과 재귀한다. 그래서 SECURITY DEFINER 함수로 추출하되 다음을 지킨다.
--
--   1. API 로 노출되는 public 이 아니라 private 스키마에 만든다
--   2. set search_path = '' 를 지정한다
--   3. 함수 안의 모든 참조를 완전한 이름으로 쓴다
--   4. PUBLIC/anon 의 EXECUTE 권한을 회수한다
--
-- authenticated 에는 EXECUTE 를 준다. RLS 정책 표현식은 질의를 실행하는
-- 역할의 권한으로 평가되므로 권한이 없으면 정책 자체가 실패한다.
-- private 스키마는 PostgREST 에 노출되지 않으므로 RPC 로는 호출할 수 없다.

-- ---------------------------------------------------------------------------
-- 멤버십 헬퍼
-- ---------------------------------------------------------------------------

create or replace function trip_private.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from trip.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function trip_private.can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from trip.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
$$;

create or replace function trip_private.is_trip_owner(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from trip.trip_members m
    where m.trip_id = p_trip_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- 같은 여행에 속한 사람인지. profiles SELECT 정책에서 사용한다.
create or replace function trip_private.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from trip.trip_members me
    join trip.trip_members other on other.trip_id = me.trip_id
    where me.user_id = (select auth.uid())
      and other.user_id = p_user_id
  );
$$;

revoke all on function
  trip_private.is_trip_member(uuid),
  trip_private.can_edit_trip(uuid),
  trip_private.is_trip_owner(uuid),
  trip_private.shares_trip_with(uuid)
from public, anon;

grant execute on function
  trip_private.is_trip_member(uuid),
  trip_private.can_edit_trip(uuid),
  trip_private.is_trip_owner(uuid),
  trip_private.shares_trip_with(uuid)
to authenticated;

create or replace function trip_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into trip.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), '')
    ),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trip_profile on auth.users;
create trigger on_auth_user_created_trip_profile
  after insert on auth.users
  for each row execute function trip_private.handle_new_user();

-- 마이그레이션 적용 전에 이미 가입한 사용자도 빠뜨리지 않는다.
insert into trip.profiles (user_id, display_name, avatar_url)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), '')
  ),
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'picture'), '')
  )
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
--
-- 낙관적 잠금(UPDATE ... WHERE updated_at = :expected)이 성립하려면
-- updated_at 이 매 변경마다 반드시 바뀌어야 한다. 애플리케이션이 빠뜨릴 수
-- 있으므로 트리거로 강제한다.
-- ---------------------------------------------------------------------------

create or replace function trip_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trips_set_updated_at on trip.trips;
create trigger trips_set_updated_at
  before update on trip.trips
  for each row execute function trip_private.set_updated_at();

drop trigger if exists profiles_set_updated_at on trip.profiles;
create trigger profiles_set_updated_at
  before update on trip.profiles
  for each row execute function trip_private.set_updated_at();

drop trigger if exists places_set_updated_at on trip.places;
create trigger places_set_updated_at
  before update on trip.places
  for each row execute function trip_private.set_updated_at();

drop trigger if exists flights_set_updated_at on trip.flights;
create trigger flights_set_updated_at
  before update on trip.flights
  for each row execute function trip_private.set_updated_at();

drop trigger if exists itinerary_items_set_updated_at on trip.itinerary_items;
create trigger itinerary_items_set_updated_at
  before update on trip.itinerary_items
  for each row execute function trip_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 여행 생성자를 owner 멤버로 등록
--
-- 이게 없으면 여행을 만든 사람이 trip_members 에 없어서 RLS 가 즉시 자기
-- 여행을 막는다. 애플리케이션 코드에 맡기면 두 번의 왕복과 실패 가능성이 생기므로
-- 트리거로 원자적으로 처리한다.
-- ---------------------------------------------------------------------------

create or replace function trip_private.add_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into trip.trip_members (trip_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (trip_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists trips_add_owner_membership on trip.trips;
create trigger trips_add_owner_membership
  after insert on trip.trips
  for each row execute function trip_private.add_owner_membership();

-- ---------------------------------------------------------------------------
-- 마지막 owner 보호
--
-- owner 가 자기 membership 을 삭제하거나 강등하면 여행이 관리자 없이 남는다.
-- 소유권 이전을 먼저 거치도록 정책 수준에서 막는다.
-- ---------------------------------------------------------------------------

create or replace function trip_private.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id     uuid;
  v_owner_count integer;
begin
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
    v_trip_id := old.trip_id;
  else
    -- owner 가 아니었거나 여전히 owner 면 검사할 것이 없다.
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
    v_trip_id := old.trip_id;
  end if;

  select count(*) into v_owner_count
  from trip.trip_members m
  where m.trip_id = v_trip_id
    and m.role = 'owner';

  if v_owner_count <= 1 then
    raise exception
      'cannot remove the last owner of trip %; transfer ownership first', v_trip_id
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_members_guard_last_owner on trip.trip_members;
create trigger trip_members_guard_last_owner
  before update or delete on trip.trip_members
  for each row execute function trip_private.guard_last_owner();

-- ---------------------------------------------------------------------------
-- 감사 기록
--
-- 테이블 행 전체를 그대로 기록하지 않는다. trip_invites/trip_share_links 의
-- token_hash 가 감사 로그로 새어 나가면 안 되므로, 남길 필드를 명시적으로 고른다.
-- ---------------------------------------------------------------------------

create or replace function trip_private.audit_trip_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row trip.trip_members;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  insert into trip.audit_events (trip_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_row.trip_id,
    (select auth.uid()),
    'trip_members.' || lower(tg_op),
    'trip_member',
    v_row.user_id::text,
    jsonb_build_object(
      'role', v_row.role,
      'previous_role', case when tg_op = 'UPDATE' then old.role else null end
    )
  );
  return null;
end;
$$;

drop trigger if exists trip_members_audit on trip.trip_members;
create trigger trip_members_audit
  after insert or update or delete on trip.trip_members
  for each row execute function trip_private.audit_trip_members();

create or replace function trip_private.audit_share_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row trip.trip_share_links;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  insert into trip.audit_events (trip_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_row.trip_id,
    (select auth.uid()),
    'trip_share_links.' || lower(tg_op),
    'share_link',
    v_row.id::text,
    -- token_hash 는 절대 기록하지 않는다.
    jsonb_build_object(
      'expires_at', v_row.expires_at,
      'revoked', v_row.revoked_at is not null
    )
  );
  return null;
end;
$$;

drop trigger if exists trip_share_links_audit on trip.trip_share_links;
create trigger trip_share_links_audit
  after insert or update or delete on trip.trip_share_links
  for each row execute function trip_private.audit_share_links();
