-- 음식점 후보 투표와 회원 초대 수락

alter table trip.places drop constraint if exists places_provider_check;
alter table trip.places add constraint places_provider_check
  check (provider in ('google', 'kakao', 'naver', 'manual'));

alter type trip.itinerary_item_source add value if not exists 'google';

create table if not exists trip.restaurant_votes (
-- Google Places를 일정 스냅샷의 출처로 저장한다.
  item_id    uuid not null references trip.itinerary_items (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

create index if not exists restaurant_votes_user_idx
  on trip.restaurant_votes (user_id, item_id);

create or replace function trip_private.can_vote_for_item(p_item_id uuid)
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
      and i.type = 'food'
      and i.status = 'candidate'
      and i.deleted_at is null
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function trip_private.can_vote_for_item(uuid) from public, anon;
grant execute on function trip_private.can_vote_for_item(uuid) to authenticated;

alter table trip.restaurant_votes enable row level security;
grant select, insert, delete on trip.restaurant_votes to authenticated;
grant all on trip.restaurant_votes to service_role;

drop policy if exists restaurant_votes_select on trip.restaurant_votes;
create policy restaurant_votes_select on trip.restaurant_votes
  for select to authenticated
  using (trip_private.can_vote_for_item(item_id));

drop policy if exists restaurant_votes_insert on trip.restaurant_votes;
create policy restaurant_votes_insert on trip.restaurant_votes
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and trip_private.can_vote_for_item(item_id)
  );

drop policy if exists restaurant_votes_delete on trip.restaurant_votes;
create policy restaurant_votes_delete on trip.restaurant_votes
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and trip_private.can_vote_for_item(item_id)
  );

-- 원문 토큰은 앱과 DB 어디에도 저장하지 않는다. 서버 액션이 SHA-256 해시만 넘긴다.
create or replace function trip.accept_invite(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite trip.trip_invites;
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
    or v_invite.used_count >= v_invite.max_uses then
    raise exception 'invite is invalid or expired' using errcode = 'invalid_parameter_value';
  end if;

  insert into trip.trip_members (trip_id, user_id, role)
  values (v_invite.trip_id, v_user_id, v_invite.role)
  on conflict (trip_id, user_id) do nothing;

  if found then
    update trip.trip_invites
    set used_count = used_count + 1,
        accepted_at = case when used_count + 1 >= max_uses then now() else accepted_at end
    where id = v_invite.id;
  end if;

  return v_invite.trip_id;
end;
$$;

revoke all on function trip.accept_invite(text) from public, anon;
grant execute on function trip.accept_invite(text) to authenticated;
