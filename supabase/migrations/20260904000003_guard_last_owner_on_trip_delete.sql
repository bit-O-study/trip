-- 여행을 물리 삭제할 수 있게 한다.
--
-- `guard_last_owner` 는 "소유자가 자기 멤버십을 빼서 여행을 고아로 만드는 것"
-- 을 막는 트리거다. 그런데 `trips` 를 DELETE 하면 FK 의 on delete cascade 가
-- `trip_members` 를 지우고, 그 삭제에도 이 트리거가 걸린다. 결과적으로
--
--     delete from trip.trips where id = ...
--     ERROR: cannot remove the last owner of trip ...; transfer ownership first
--
-- 즉 **여행을 영구 삭제할 방법이 아예 없었다.** `trips_delete` 정책은 소유자에게
-- 물리 삭제를 허용하고 있고, "30일 보관 후 물리 삭제"(architecture.md §1) 도
-- 이 경로를 쓴다. 둘 다 조용히 막혀 있었다.
--
-- 여행 자체가 사라지는 중이면 고아가 될 여행이 없다. 부모 행이 이미 없으면
-- 검사를 건너뛴다. cascade 삭제는 부모를 지운 **뒤에** 참조 행을 지우므로,
-- 이 시점의 스냅샷에는 trips 행이 보이지 않는다.
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

  -- 여행이 통째로 사라지는 중이면 지킬 소유권도 없다.
  if not exists (select 1 from trip.trips t where t.id = v_trip_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
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

-- 같은 이유로 감사 트리거도 막혀 있었다.
--
-- `trips` 를 지우면 cascade 로 `trip_members` / `trip_share_links` 가 지워지고,
-- 그 삭제마다 감사 트리거가 `audit_events` 에 행을 넣으려 한다. 그런데 부모
-- 여행은 이미 없어졌으므로 `audit_events_trip_id_fkey` 에 걸린다.
--
--     ERROR: insert or update on table "audit_events"
--            violates foreign key constraint "audit_events_trip_id_fkey"
--
-- 사라진 여행의 감사 기록은 어차피 같은 cascade 로 함께 지워진다. 남길 곳이
-- 없는 기록을 남기려다 삭제 자체를 실패시키지 않는다.
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

  -- 여행이 사라지는 중이면 기록할 대상이 없다.
  if not exists (select 1 from trip.trips t where t.id = v_row.trip_id) then
    return null;
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

  if not exists (select 1 from trip.trips t where t.id = v_row.trip_id) then
    return null;
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
