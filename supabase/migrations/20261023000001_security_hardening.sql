-- 보안 점검(2026-10-23) 대응 1/2 — 앱 배포 전에 적용해도 기존 앱이 깨지지 않는 변경
--
-- 재현 테스트: src/test/db/security.test.ts (P1–P16).
-- 2/2(20261023000002)는 새 앱 코드가 배포된 뒤에 적용한다 — 옛 앱이 쓰던
-- 직접 INSERT / 전역 마감 RPC 를 막는다.
--
-- 이 파일도 다른 마이그레이션처럼 여러 번 실행해도 안전해야 한다
-- (src/test/db/idempotency.test.ts).

-- ===========================================================================
-- 0. 공용 헬퍼
-- ===========================================================================

-- IANA 시간대 이름인지. Postgres 가 모르는 이름이면 `at time zone` 이 예외를
-- 던지고, 그 예외가 next_sort_order / move_item / rebalance_day 같은 여행 전체
-- RPC 를 전부 실패시킨다(P8: editor 가 'Mars/Base' 를 넣으면 여행이 마비).
create or replace function trip_private.is_valid_timezone(p_timezone text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_timezone is null then
    return true;
  end if;
  -- "UTC" 또는 "Area/Location[/Sub]" 형태만. POSIX 식 "XYZ+5" 같은 값은
  -- 브라우저 Intl 이 다르게 해석하므로 받지 않는다.
  if p_timezone !~ '^(UTC|[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2})$' then
    return false;
  end if;
  perform ('2000-01-01 00:00:00+00'::timestamptz at time zone p_timezone);
  return true;
exception
  when others then
    return false;
end;
$$;

-- 아바타 URL 정규화. 가입 트리거(auth.users)에서 쓰므로 절대 예외를 던지면
-- 안 된다 — 이 트리거가 실패하면 헬쑤를 포함한 모든 가입이 막힌다.
-- http 는 https 로 올리고, CSS url() / 속성 문맥을 깨는 문자가 있으면 버린다.
create or replace function trip_private.safe_avatar_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_url, ''));
begin
  if v_url = '' then
    return null;
  end if;
  if v_url ~* '^http://' then
    v_url := 'https://' || substr(v_url, 8);
  end if;
  if length(v_url) > 2048 or v_url !~ '^https://[^[:space:]"''()<>\\]+$' then
    return null;
  end if;
  return v_url;
end;
$$;

revoke all on function
  trip_private.is_valid_timezone(text),
  trip_private.safe_avatar_url(text)
from public, anon;

-- CHECK 제약 안의 함수도 실행하는 역할의 EXECUTE 권한을 요구한다.
grant execute on function
  trip_private.is_valid_timezone(text),
  trip_private.safe_avatar_url(text)
to authenticated, service_role;

-- ===========================================================================
-- 1. trips — 휴지통·소유자 변경은 owner 만, owner_id 는 직접 못 바꾼다
-- ===========================================================================

-- 계정 삭제를 막지 않도록 (P6). owner_id 는 "현재 owner 멤버 중 한 명" 을
-- 가리키는 캐시이고, 아래 sync 트리거가 유지한다.
alter table trip.trips alter column owner_id drop not null;
alter table trip.trips drop constraint if exists trips_owner_id_fkey;
alter table trip.trips
  add constraint trips_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

-- 편집자는 일반 필드만. owner_id / id / created_at / updated_at 은 빠진다.
-- (updated_at 은 트리거가 채운다. 트리거가 바꾸는 값에는 컬럼 권한이 적용되지 않는다.)
revoke update on trip.trips from authenticated;
grant update (
  title, description, cover_image_url, destination_name, start_date, end_date,
  timezone, base_currency, status, archived_at, deleted_at
) on trip.trips to authenticated;

-- 휴지통 이동·복구는 owner 만 (editor 가 여행을 지웠다 살렸다 할 수 없다).
-- RLS 정책은 바뀌기 전 값을 볼 수 없어 트리거로 건다. service_role·superuser
-- (auth.uid() 가 없는 서버 경로)는 30일 정리 같은 작업을 해야 하므로 통과시킨다.
create or replace function trip_private.guard_trip_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and (select auth.uid()) is not null
     and not trip_private.is_trip_owner(old.id) then
    raise exception 'only a trip owner can move a trip to or from the trash'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_guard_update on trip.trips;
create trigger trips_guard_update
  before update on trip.trips
  for each row execute function trip_private.guard_trip_update();

-- P8: 시간대와 기간. 기존 행에 위반이 있어도 배포가 실패하지 않도록 NOT VALID
-- 로 걸고(새로 쓰는 값은 즉시 검사된다), 깨끗하면 바로 VALIDATE 한다.
do $$ begin
  alter table trip.trips
    add constraint trips_timezone_valid check (trip_private.is_valid_timezone(timezone)) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table trip.trips
    add constraint trips_reasonable_dates check (
      start_date >= date '1950-01-01'
      and end_date <= date '2150-12-31'
      and end_date - start_date <= 365
    ) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table trip.itinerary_items
    add constraint itinerary_items_timezone_valid check (trip_private.is_valid_timezone(timezone)) not valid;
exception when duplicate_object then null;
end $$;

do $$
declare
  v_name text;
begin
  foreach v_name in array array['trips_timezone_valid', 'trips_reasonable_dates'] loop
    begin
      execute format('alter table trip.trips validate constraint %I', v_name);
    exception when check_violation then
      raise warning '기존 trips 행이 % 를 위반합니다. 데이터를 고친 뒤 VALIDATE 하세요.', v_name;
    end;
  end loop;
  begin
    alter table trip.itinerary_items validate constraint itinerary_items_timezone_valid;
  exception when check_violation then
    raise warning '기존 itinerary_items 행이 itinerary_items_timezone_valid 를 위반합니다.';
  end;
end $$;

-- ===========================================================================
-- 2. trip_members — 멤버는 초대 수락으로만 생기고, owner 는 역할만 바꾼다 (P5, P10)
-- ===========================================================================

drop policy if exists trip_members_insert on trip.trip_members;
revoke insert on trip.trip_members from authenticated;

-- trip_id / user_id 를 바꾸면 "owner 행을 다른 여행으로 옮기기", "아무 계정이나
-- owner 로 만들기" 가 된다. 역할만 바꿀 수 있다.
revoke update on trip.trip_members from authenticated;
grant update (role) on trip.trip_members to authenticated;

-- 내보낸 기록. 같은 초대 링크로 되돌아오는 것을 막는다(P7).
-- 스스로 나간 경우는 기록하지 않는다.
create table if not exists trip.trip_member_removals (
  trip_id    uuid not null references trip.trips (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  removed_by uuid references auth.users (id) on delete set null,
  removed_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

alter table trip.trip_member_removals enable row level security;
revoke all on trip.trip_member_removals from authenticated, anon;
grant select on trip.trip_member_removals to authenticated;
grant all on trip.trip_member_removals to service_role;

drop policy if exists trip_member_removals_select on trip.trip_member_removals;
create policy trip_member_removals_select on trip.trip_member_removals
  for select to authenticated
  using (trip_private.is_trip_owner(trip_id));

-- 마지막 owner 보호 (개정)
--
--  - 여행 행을 FOR NO KEY UPDATE 로 잠근 뒤 센다. 두 owner 가 동시에 서로를
--    강등·삭제하면 각자 "owner 가 2명" 을 보고 둘 다 통과해 여행이 고아가 됐다.
--    잠금 뒤의 count 는 새 스냅샷(READ COMMITTED)이라 먼저 끝난 쪽을 본다.
--    NO KEY UPDATE 는 FK 검사가 거는 KEY SHARE 와 충돌하지 않아 일정 추가를
--    막지 않는다.
--  - 계정 삭제(auth.users cascade) 중이면 막지 않고 남은 멤버에게 넘긴다(P6).
create or replace function trip_private.guard_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id     uuid;
  v_owner_count integer;
  v_successor   uuid;
begin
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
  else
    if old.role <> 'owner' or new.role = 'owner' then
      return new;
    end if;
  end if;
  v_trip_id := old.trip_id;

  perform 1 from trip.trips t where t.id = v_trip_id for no key update;
  -- 여행이 통째로 사라지는 중이면 지킬 소유권도 없다.
  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select count(*) into v_owner_count
  from trip.trip_members m
  where m.trip_id = v_trip_id
    and m.role = 'owner';

  if v_owner_count > 1 then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- 계정 자체가 지워지는 중: 소유권을 남은 멤버(편집자 우선, 오래된 순)에게 넘긴다.
  if tg_op = 'DELETE'
     and not exists (select 1 from auth.users u where u.id = old.user_id) then
    select m.user_id into v_successor
    from trip.trip_members m
    where m.trip_id = v_trip_id
      and m.user_id <> old.user_id
    order by (m.role = 'editor') desc, m.joined_at, m.user_id
    limit 1;

    if v_successor is not null then
      update trip.trip_members
      set role = 'owner'
      where trip_id = v_trip_id and user_id = v_successor;
    end if;
    return old;
  end if;

  raise exception
    'cannot remove the last owner of trip %; transfer ownership first', v_trip_id
    using errcode = 'check_violation';
end;
$$;

-- 멤버 변경 뒤처리
--  1. trips.owner_id 를 실제 owner 멤버로 맞춘다. 내보내지거나 강등된
--     생성자가 owner_id 조건으로 여행 행을 계속 읽던 문제(P4)를 막는다.
--  2. 떠난 멤버의 진행 중 투표 표를 지운다(P12).
--  3. 다른 사람이 내보낸 경우 기록을 남긴다(P7).
--  4. 계정 삭제로 멤버가 아무도 남지 않은 여행은 함께 지운다(P6).
create or replace function trip_private.after_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id  uuid := coalesce(new.trip_id, old.trip_id);
  v_owner_id uuid;
  v_found    boolean;
  v_actor    uuid := (select auth.uid());
begin
  select t.owner_id, true into v_owner_id, v_found
  from trip.trips t
  where t.id = v_trip_id;

  -- 여행이 사라지는 중(cascade)이면 할 일이 없다.
  if v_found is null then
    return null;
  end if;

  if tg_op = 'DELETE' then
    delete from trip.restaurant_votes v
    using trip.restaurant_polls p
    where v.poll_id = p.id
      and p.trip_id = v_trip_id
      and p.status = 'open'
      and v.user_id = old.user_id;

    if v_actor is not null
       and v_actor <> old.user_id
       and exists (select 1 from auth.users u where u.id = old.user_id) then
      insert into trip.trip_member_removals (trip_id, user_id, removed_by, removed_at)
      values (v_trip_id, old.user_id, v_actor, now())
      on conflict (trip_id, user_id)
      do update set removed_by = excluded.removed_by, removed_at = excluded.removed_at;
    end if;

    if not exists (select 1 from trip.trip_members m where m.trip_id = v_trip_id)
       and not exists (select 1 from auth.users u where u.id = old.user_id) then
      delete from trip.trips where id = v_trip_id;
      return null;
    end if;
  end if;

  if v_owner_id is null
     or not exists (
       select 1 from trip.trip_members m
       where m.trip_id = v_trip_id and m.user_id = v_owner_id and m.role = 'owner'
     ) then
    update trip.trips t
    set owner_id = (
      select m.user_id from trip.trip_members m
      where m.trip_id = v_trip_id and m.role = 'owner'
      order by m.joined_at, m.user_id
      limit 1
    )
    where t.id = v_trip_id;
  end if;

  return null;
end;
$$;

drop trigger if exists trip_members_after_change on trip.trip_members;
create trigger trip_members_after_change
  after insert or update or delete on trip.trip_members
  for each row execute function trip_private.after_member_change();

-- 기존 데이터: owner_id 가 현재 owner 멤버가 아니면 맞춘다.
update trip.trips t
set owner_id = sub.user_id
from (
  select distinct on (m.trip_id) m.trip_id, m.user_id
  from trip.trip_members m
  where m.role = 'owner'
  order by m.trip_id, m.joined_at, m.user_id
) sub
where sub.trip_id = t.id
  and not exists (
    select 1 from trip.trip_members m
    where m.trip_id = t.id and m.user_id = t.owner_id and m.role = 'owner'
  );

-- trips SELECT 는 멤버십 기준. owner_id 분기는 `insert ... returning` 이
-- 멤버십 트리거보다 먼저 SELECT 정책을 통과해야 해서 남긴다 — owner_id 는 이제
-- 바꿀 수 없고 항상 현재 owner 멤버를 가리키므로 멤버십과 같은 뜻이다.
drop policy if exists trips_select on trip.trips;
create policy trips_select on trip.trips
  for select to authenticated
  using (trip_private.is_trip_member(id) or owner_id = (select auth.uid()));

-- ===========================================================================
-- 3. 계정 삭제를 막던 FK (P6)
-- ===========================================================================

alter table trip.restaurant_polls alter column created_by drop not null;
alter table trip.restaurant_polls alter column created_by set default auth.uid();
alter table trip.restaurant_polls drop constraint if exists restaurant_polls_created_by_fkey;
alter table trip.restaurant_polls
  add constraint restaurant_polls_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

-- ===========================================================================
-- 4. 음식점 투표 무결성 (P1, P2, P3, P9, P13)
-- ===========================================================================

create unique index if not exists restaurant_polls_id_trip_key
  on trip.restaurant_polls (id, trip_id);

-- 기존 데이터: 다른 여행의 투표에 붙은 후보·다른 여행 항목을 가리키는 승자는 끊는다.
update trip.itinerary_items i
set restaurant_poll_id = null
where i.restaurant_poll_id is not null
  and not exists (
    select 1 from trip.restaurant_polls p
    where p.id = i.restaurant_poll_id and p.trip_id = i.trip_id
  );

update trip.restaurant_polls p
set winner_item_id = null
where p.winner_item_id is not null
  and not exists (
    select 1 from trip.itinerary_items i
    where i.id = p.winner_item_id and i.trip_id = p.trip_id
  );

-- P2: 후보는 같은 여행의 투표에만 붙는다. 투표가 지워지면 후보의 연결만 끊는다.
alter table trip.itinerary_items drop constraint if exists itinerary_items_restaurant_poll_id_fkey;
alter table trip.itinerary_items drop constraint if exists itinerary_items_restaurant_poll_same_trip_fkey;
alter table trip.itinerary_items
  add constraint itinerary_items_restaurant_poll_same_trip_fkey
  foreign key (restaurant_poll_id, trip_id)
  references trip.restaurant_polls (id, trip_id)
  on delete set null (restaurant_poll_id);

-- P13: 승자는 같은 여행의 항목만.
alter table trip.restaurant_polls drop constraint if exists restaurant_polls_winner_fk;
alter table trip.restaurant_polls drop constraint if exists restaurant_polls_winner_same_trip_fk;
alter table trip.restaurant_polls
  add constraint restaurant_polls_winner_same_trip_fk
  foreign key (winner_item_id, trip_id)
  references trip.itinerary_items (id, trip_id)
  on delete set null (winner_item_id);

-- P1/P13: 편집자는 제목·시각만 고친다. 상태·승자·생성자·여행은 마감 함수만 바꾼다.
revoke insert, update on trip.restaurant_polls from authenticated;
grant insert (trip_id, title, scheduled_at, closes_at, created_by) on trip.restaurant_polls to authenticated;
grant update (title, scheduled_at, closes_at) on trip.restaurant_polls to authenticated;

drop policy if exists restaurant_polls_insert on trip.restaurant_polls;
create policy restaurant_polls_insert on trip.restaurant_polls
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'open'
    and winner_item_id is null
    and finalized_at is null
    and trip_private.can_edit_trip(trip_id)
  );

drop policy if exists restaurant_polls_update on trip.restaurant_polls;
create policy restaurant_polls_update on trip.restaurant_polls
  for update to authenticated
  using (status = 'open' and trip_private.can_edit_trip(trip_id))
  with check (status = 'open' and trip_private.can_edit_trip(trip_id));

drop policy if exists restaurant_polls_delete on trip.restaurant_polls;
create policy restaurant_polls_delete on trip.restaurant_polls
  for delete to authenticated
  using (trip_private.can_edit_trip(trip_id));

-- 투표 가능 여부: 후보와 투표가 같은 여행이어야 한다.
create or replace function trip_private.can_vote_for_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from trip.itinerary_items i
    join trip.restaurant_polls p on p.id = i.restaurant_poll_id and p.trip_id = i.trip_id
    join trip.trip_members m on m.trip_id = i.trip_id
    where i.id = p_item_id and i.type = 'food' and i.status = 'candidate'
      and i.deleted_at is null and p.status = 'open' and p.closes_at > now()
      and m.user_id = (select auth.uid())
  );
$$;

-- 투표 하나를 마감한다. 내부 전용(trip_private).
-- 같은 여행의 후보만, 현재 멤버의 표만 센다.
create or replace function trip_private.finalize_restaurant_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll   trip.restaurant_polls;
  v_winner uuid;
begin
  select * into v_poll
  from trip.restaurant_polls p
  where p.id = p_poll_id and p.status = 'open' and p.closes_at <= now()
  for update skip locked;

  if not found then
    return false;
  end if;

  select i.id into v_winner
  from trip.itinerary_items i
  left join trip.restaurant_votes v
    on v.item_id = i.id
   and v.poll_id = v_poll.id
   and exists (
     select 1 from trip.trip_members m
     where m.trip_id = v_poll.trip_id and m.user_id = v.user_id
   )
  where i.restaurant_poll_id = v_poll.id
    and i.trip_id = v_poll.trip_id
    and i.status = 'candidate'
    and i.deleted_at is null
  group by i.id, i.created_at
  order by count(v.user_id) desc, i.created_at asc, i.id asc
  limit 1;

  if v_winner is not null then
    update trip.itinerary_items
    set status = case when id = v_winner
                      then 'confirmed'::trip.itinerary_item_status
                      else 'cancelled'::trip.itinerary_item_status end,
        start_at = v_poll.scheduled_at
    where restaurant_poll_id = v_poll.id
      and trip_id = v_poll.trip_id
      and status = 'candidate';
  end if;

  update trip.restaurant_polls
  set status = 'finalized', winner_item_id = v_winner, finalized_at = now()
  where id = v_poll.id;
  return true;
end;
$$;

revoke all on function trip_private.finalize_restaurant_poll(uuid) from public, anon, authenticated;

-- 전역 마감. cron·서버(service_role) 전용 — authenticated 권한 회수는 2/2 에서 한다
-- (옛 앱이 화면을 열 때 이 함수를 부르므로).
create or replace function trip.finalize_due_restaurant_polls()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_count   integer := 0;
begin
  for v_poll_id in
    select p.id from trip.restaurant_polls p
    where p.status = 'open' and p.closes_at <= now()
    order by p.closes_at
  loop
    if trip_private.finalize_restaurant_poll(v_poll_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- 여행별 마감. 화면을 여는 멤버가 자기 여행의 지난 투표만 마감한다 (P9).
create or replace function trip.finalize_due_restaurant_polls_for_trip(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_count   integer := 0;
begin
  if not trip_private.is_trip_member(p_trip_id) then
    raise exception 'not a member of trip %', p_trip_id using errcode = 'insufficient_privilege';
  end if;

  for v_poll_id in
    select p.id from trip.restaurant_polls p
    where p.trip_id = p_trip_id and p.status = 'open' and p.closes_at <= now()
    order by p.closes_at
  loop
    if trip_private.finalize_restaurant_poll(v_poll_id) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function trip.finalize_due_restaurant_polls_for_trip(uuid) from public, anon;
grant execute on function trip.finalize_due_restaurant_polls_for_trip(uuid) to authenticated, service_role;

-- P3: 생성자라도 지금 그 여행의 멤버여야 지울 수 있다.
create or replace function trip.delete_own_restaurant_poll(p_poll_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
  v_user_id uuid;
begin
  v_user_id := coalesce(
    (select auth.uid()),
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
  );

  if v_user_id is null then
    return false;
  end if;

  select p.trip_id into v_trip_id
  from trip.restaurant_polls p
  where p.id = p_poll_id
    and p.created_by = v_user_id
    and exists (
      select 1 from trip.trip_members m
      where m.trip_id = p.trip_id and m.user_id = v_user_id
    )
  for update;

  if v_trip_id is null then
    return false;
  end if;

  update trip.itinerary_items
  set deleted_at = coalesce(deleted_at, now())
  where restaurant_poll_id = p_poll_id
    and trip_id = v_trip_id;

  delete from trip.restaurant_polls where id = p_poll_id;
  return true;
end;
$$;

revoke all on function trip.delete_own_restaurant_poll(uuid) from public, anon;
grant execute on function trip.delete_own_restaurant_poll(uuid) to authenticated, service_role;

-- ===========================================================================
-- 5. 초대 (P7)
-- ===========================================================================

alter table trip.trip_invites alter column created_by set default auth.uid();
alter table trip.trip_invites alter column expires_at set default now() + interval '7 days';

drop policy if exists trip_invites_all on trip.trip_invites;
drop policy if exists trip_invites_select on trip.trip_invites;
drop policy if exists trip_invites_insert on trip.trip_invites;
drop policy if exists trip_invites_update on trip.trip_invites;
drop policy if exists trip_invites_delete on trip.trip_invites;

create policy trip_invites_select on trip.trip_invites
  for select to authenticated
  using (trip_private.is_trip_owner(trip_id));

create policy trip_invites_insert on trip.trip_invites
  for insert to authenticated
  with check (
    trip_private.is_trip_owner(trip_id)
    and created_by = (select auth.uid())
    and expires_at is not null
    and expires_at <= now() + interval '30 days'
    and max_uses <= 100
    and used_count = 0
    and revoked_at is null
    and accepted_at is null
  );

-- 폐기만. 폐기를 되돌리거나 사용 횟수·만료를 늘리는 경로는 없다.
create policy trip_invites_update on trip.trip_invites
  for update to authenticated
  using (trip_private.is_trip_owner(trip_id))
  with check (trip_private.is_trip_owner(trip_id) and revoked_at is not null);

create policy trip_invites_delete on trip.trip_invites
  for delete to authenticated
  using (trip_private.is_trip_owner(trip_id));

revoke update on trip.trip_invites from authenticated;
grant update (revoked_at) on trip.trip_invites to authenticated;

create or replace function trip.accept_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite  trip.trip_invites;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_invite
  from trip.trip_invites i
  where i.token_hash = p_token_hash
  for update;

  if not found
    or v_invite.revoked_at is not null
    or (v_invite.expires_at is not null and v_invite.expires_at <= now())
    or v_invite.used_count >= v_invite.max_uses
    -- 휴지통에 있거나 사라진 여행
    or not exists (
      select 1 from trip.trips t
      where t.id = v_invite.trip_id and t.deleted_at is null
    )
    -- 만든 사람이 더 이상 owner 가 아니면 그 사람이 뿌린 링크도 끝난다
    or not exists (
      select 1 from trip.trip_members m
      where m.trip_id = v_invite.trip_id
        and m.user_id = v_invite.created_by
        and m.role = 'owner'
    ) then
    raise exception 'invite is invalid or expired' using errcode = 'invalid_parameter_value';
  end if;

  -- 내보내진 사람은 내보내기 전에 만든 링크로 돌아올 수 없다.
  if exists (
    select 1 from trip.trip_member_removals r
    where r.trip_id = v_invite.trip_id
      and r.user_id = v_user_id
      and r.removed_at >= v_invite.created_at
  ) then
    raise exception 'invite is no longer valid for this account'
      using errcode = 'insufficient_privilege';
  end if;

  insert into trip.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, v_user_id, v_invite.role)
  on conflict (trip_id, user_id) do nothing;

  if found then
    update trip.trip_invites
    set used_count = used_count + 1,
        accepted_at = case when used_count + 1 >= max_uses then now() else accepted_at end
    where id = v_invite.id;

    delete from trip.trip_member_removals
    where trip_id = v_invite.trip_id and user_id = v_user_id;
  end if;

  return v_invite.trip_id;
end;
$$;

revoke all on function trip.accept_invite(text) from public, anon;
grant execute on function trip.accept_invite(text) to authenticated;

-- ===========================================================================
-- 6. 공유 링크 (P14)
-- ===========================================================================

alter table trip.trip_share_links alter column created_by set default auth.uid();
alter table trip.trip_share_links alter column expires_at set default now() + interval '30 days';

drop policy if exists trip_share_links_all on trip.trip_share_links;
drop policy if exists trip_share_links_select on trip.trip_share_links;
drop policy if exists trip_share_links_insert on trip.trip_share_links;
drop policy if exists trip_share_links_update on trip.trip_share_links;
drop policy if exists trip_share_links_delete on trip.trip_share_links;

create policy trip_share_links_select on trip.trip_share_links
  for select to authenticated
  using (trip_private.is_trip_owner(trip_id));

create policy trip_share_links_insert on trip.trip_share_links
  for insert to authenticated
  with check (
    trip_private.is_trip_owner(trip_id)
    and created_by = (select auth.uid())
    and expires_at is not null
    and expires_at <= now() + interval '90 days'
    and revoked_at is null
    and access_count = 0
  );

create policy trip_share_links_update on trip.trip_share_links
  for update to authenticated
  using (trip_private.is_trip_owner(trip_id))
  with check (trip_private.is_trip_owner(trip_id) and revoked_at is not null);

create policy trip_share_links_delete on trip.trip_share_links
  for delete to authenticated
  using (trip_private.is_trip_owner(trip_id));

revoke update on trip.trip_share_links from authenticated;
grant update (revoked_at) on trip.trip_share_links to authenticated;

-- ===========================================================================
-- 7. 작성자 컬럼 위조 (P16)
-- ===========================================================================

alter table trip.itinerary_items alter column created_by set default auth.uid();
alter table trip.attachments alter column uploaded_by set default auth.uid();

drop policy if exists itinerary_items_insert on trip.itinerary_items;
create policy itinerary_items_insert on trip.itinerary_items
  for insert to authenticated
  with check (
    trip_private.can_edit_trip(trip_id)
    and created_by = (select auth.uid())
  );

drop policy if exists attachments_insert on trip.attachments;
create policy attachments_insert on trip.attachments
  for insert to authenticated
  with check (
    trip_private.can_edit_trip(trip_id)
    and uploaded_by = (select auth.uid())
  );

-- 수정할 때 작성자는 그대로 둔다(조용히 원래 값 유지).
create or replace function trip_private.keep_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'itinerary_items' then
    new.created_by := old.created_by;
  elsif tg_table_name = 'attachments' then
    new.uploaded_by := old.uploaded_by;
  end if;
  return new;
end;
$$;

drop trigger if exists itinerary_items_keep_author on trip.itinerary_items;
create trigger itinerary_items_keep_author
  before update on trip.itinerary_items
  for each row
  when (old.created_by is distinct from new.created_by and old.created_by is not null)
  execute function trip_private.keep_author();

drop trigger if exists attachments_keep_author on trip.attachments;
create trigger attachments_keep_author
  before update on trip.attachments
  for each row
  when (old.uploaded_by is distinct from new.uploaded_by and old.uploaded_by is not null)
  execute function trip_private.keep_author();

-- ===========================================================================
-- 8. 프로필 아바타 (CSS 주입)
-- ===========================================================================

update trip.profiles
set avatar_url = trip_private.safe_avatar_url(avatar_url)
where avatar_url is distinct from trip_private.safe_avatar_url(avatar_url);

do $$ begin
  alter table trip.profiles
    add constraint profiles_avatar_url_safe check (
      avatar_url is null
      or (length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:]"''()<>\\]+$')
    );
exception when duplicate_object then null;
end $$;

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
    trip_private.safe_avatar_url(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
        nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
      )
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ===========================================================================
-- 9. Storage — 쓰지 않는 첨부 버킷의 쓰기 차단, 크기·형식 제한
-- ===========================================================================
--
-- 앱에는 아직 첨부 업로드 화면이 없다. 쓰기 정책이 열려 있으면 편집자가 임의
-- 파일(HTML 등)을 올려 저장소를 무료 호스팅처럼 쓸 수 있다. 기능이 생길 때
-- 서버 경로와 함께 다시 연다. 읽기 정책은 남긴다.

drop policy if exists trip_attachments_insert on storage.objects;
drop policy if exists trip_attachments_update on storage.objects;
drop policy if exists trip_attachments_delete on storage.objects;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    execute $sql$
      update storage.buckets
      set file_size_limit = 10485760,
          allowed_mime_types = array[
            'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
            'application/pdf'
          ]
      where id = 'trip-attachments'
    $sql$;
  end if;
end $$;

-- ===========================================================================
-- 10. flights / places — 서버 RPC 로만 쓰기 (P11). 이 파일은 RPC 만 추가한다.
-- ===========================================================================

-- 장소 URL 은 http(s) 만. 앱이 링크로 그린다.
do $$ begin
  alter table trip.places
    add constraint places_url_http check (url is null or url ~* '^https?://') not valid;
exception when duplicate_object then null;
end $$;

-- 편집 권한이 있는 여행에 일정으로 넣으려는 장소를 저장하고 id 를 돌려준다.
-- 이미 있는 (provider, provider_place_id) 는 덮어쓰지 않는다 — 공유 행을 한
-- 사용자가 바꾸면 다른 여행에서 보이는 값이 달라진다.
create or replace function trip.save_place(p_trip_id uuid, p_place jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row trip.places;
  v_id  uuid;
begin
  if not trip_private.can_edit_trip(p_trip_id) then
    raise exception 'not allowed to add places to trip %', p_trip_id
      using errcode = 'insufficient_privilege';
  end if;

  v_row := jsonb_populate_record(null::trip.places, p_place);

  insert into trip.places (
    provider, provider_place_id, name, category, category_group, address,
    road_address, phone, url, latitude, longitude
  )
  values (
    v_row.provider, v_row.provider_place_id, v_row.name, v_row.category,
    coalesce(v_row.category_group, 'etc'), v_row.address, v_row.road_address,
    v_row.phone, v_row.url, v_row.latitude, v_row.longitude
  )
  on conflict (provider, provider_place_id) do nothing
  returning id into v_id;

  if v_id is null then
    select p.id into v_id
    from trip.places p
    where p.provider = v_row.provider and p.provider_place_id = v_row.provider_place_id;
  end if;

  return v_id;
end;
$$;

create or replace function trip.save_flight(p_trip_id uuid, p_flight jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row trip.flights;
  v_id  uuid;
begin
  if not trip_private.can_edit_trip(p_trip_id) then
    raise exception 'not allowed to add flights to trip %', p_trip_id
      using errcode = 'insufficient_privilege';
  end if;

  v_row := jsonb_populate_record(null::trip.flights, p_flight);

  if not trip_private.is_valid_timezone(v_row.departure_timezone)
     or not trip_private.is_valid_timezone(v_row.arrival_timezone) then
    raise exception 'invalid airport timezone' using errcode = 'check_violation';
  end if;

  insert into trip.flights (
    provider, provider_flight_id, marketing_flight_number, operating_flight_number,
    flight_number_input, flight_number_key, airline_code, operating_airline_code,
    departure_airport, departure_terminal, departure_gate, departure_timezone,
    arrival_airport, arrival_terminal, arrival_gate, arrival_timezone,
    scheduled_departure, estimated_departure, actual_departure,
    scheduled_arrival, estimated_arrival, actual_arrival, status
  )
  values (
    v_row.provider, v_row.provider_flight_id, v_row.marketing_flight_number, v_row.operating_flight_number,
    v_row.flight_number_input, v_row.flight_number_key, v_row.airline_code, v_row.operating_airline_code,
    v_row.departure_airport, v_row.departure_terminal, v_row.departure_gate, v_row.departure_timezone,
    v_row.arrival_airport, v_row.arrival_terminal, v_row.arrival_gate, v_row.arrival_timezone,
    v_row.scheduled_departure, v_row.estimated_departure, v_row.actual_departure,
    v_row.scheduled_arrival, v_row.estimated_arrival, v_row.actual_arrival,
    coalesce(v_row.status, 'scheduled')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function trip.save_place(uuid, jsonb), trip.save_flight(uuid, jsonb) from public, anon;
grant execute on function trip.save_place(uuid, jsonb), trip.save_flight(uuid, jsonb)
  to authenticated, service_role;

-- 읽기 범위 헬퍼. 정책은 2/2 에서 바꾼다.
create or replace function trip_private.can_read_place(p_place_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from trip.itinerary_items i
    join trip.trip_members m on m.trip_id = i.trip_id
    where i.place_id = p_place_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function trip_private.can_read_flight(p_flight_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from trip.itinerary_items i
    join trip.trip_members m on m.trip_id = i.trip_id
    where i.flight_id = p_flight_id and m.user_id = (select auth.uid())
  );
$$;

revoke all on function trip_private.can_read_place(uuid), trip_private.can_read_flight(uuid) from public, anon;
grant execute on function trip_private.can_read_place(uuid), trip_private.can_read_flight(uuid)
  to authenticated;

-- ===========================================================================
-- 11. 감사 기록 범위 (P15) — 여행 생성·휴지통·복구·소유자 변경, 초대
-- ===========================================================================

create or replace function trip_private.audit_trips()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'trips.insert';
  elsif new.deleted_at is distinct from old.deleted_at then
    v_action := case when new.deleted_at is null then 'trips.restore' else 'trips.trash' end;
  elsif new.owner_id is distinct from old.owner_id then
    v_action := 'trips.owner_change';
  else
    return null;
  end if;

  -- AFTER 트리거는 문장 끝에 몰아서 실행된다. 계정 삭제 cascade 처럼 같은
  -- 문장 안에서 여행이 지워졌으면 남길 곳이 없다.
  if not exists (select 1 from trip.trips t where t.id = new.id) then
    return null;
  end if;

  insert into trip.audit_events (trip_id, actor_id, action, target_type, target_id, metadata)
  values (
    new.id,
    (select auth.uid()),
    v_action,
    'trip',
    new.id::text,
    jsonb_build_object(
      'owner_id', new.owner_id,
      'previous_owner_id', case when tg_op = 'UPDATE' then old.owner_id else null end
    )
  );
  return null;
end;
$$;

drop trigger if exists trips_audit on trip.trips;
create trigger trips_audit
  after insert or update on trip.trips
  for each row execute function trip_private.audit_trips();

create or replace function trip_private.audit_trip_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    trip.trip_invites;
  v_action text;
begin
  if tg_op = 'DELETE' then
    v_row := old;
    v_action := 'trip_invites.delete';
  elsif tg_op = 'INSERT' then
    v_row := new;
    v_action := 'trip_invites.insert';
  elsif new.revoked_at is not null and old.revoked_at is null then
    v_row := new;
    v_action := 'trip_invites.revoke';
  else
    -- 수락으로 used_count 가 오르는 것은 trip_members.insert 로 이미 남는다.
    return null;
  end if;

  if not exists (select 1 from trip.trips t where t.id = v_row.trip_id) then
    return null;
  end if;

  insert into trip.audit_events (trip_id, actor_id, action, target_type, target_id, metadata)
  values (
    v_row.trip_id,
    (select auth.uid()),
    v_action,
    'invite',
    v_row.id::text,
    -- token_hash 는 절대 기록하지 않는다.
    jsonb_build_object(
      'role', v_row.role,
      'max_uses', v_row.max_uses,
      'expires_at', v_row.expires_at
    )
  );
  return null;
end;
$$;

drop trigger if exists trip_invites_audit on trip.trip_invites;
create trigger trip_invites_audit
  after insert or update or delete on trip.trip_invites
  for each row execute function trip_private.audit_trip_invites();

-- 새로 만든 SECURITY DEFINER 헬퍼는 RPC 로 노출되지 않게 둔다.
revoke all on function
  trip_private.guard_last_owner(),
  trip_private.after_member_change(),
  trip_private.audit_trips(),
  trip_private.audit_trip_invites()
from public, anon, authenticated;
