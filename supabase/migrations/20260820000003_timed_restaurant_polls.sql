-- 일정 시각과 종료 시각을 갖는 음식점 투표

create table if not exists trip.restaurant_polls (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references trip.trips (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  scheduled_at  timestamptz not null,
  closes_at     timestamptz not null,
  status        text not null default 'open' check (status in ('open', 'finalized', 'cancelled')),
  winner_item_id uuid,
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  finalized_at  timestamptz,
  check (closes_at < scheduled_at)
);

alter table trip.itinerary_items
  add column if not exists restaurant_poll_id uuid references trip.restaurant_polls (id) on delete set null;

do $$ begin
  alter table trip.restaurant_polls
    add constraint restaurant_polls_winner_fk
    foreign key (winner_item_id) references trip.itinerary_items (id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table trip.restaurant_votes add column if not exists poll_id uuid references trip.restaurant_polls (id) on delete cascade;
create unique index if not exists restaurant_votes_one_choice_idx
  on trip.restaurant_votes (poll_id, user_id) where poll_id is not null;
create index if not exists restaurant_polls_due_idx
  on trip.restaurant_polls (closes_at) where status = 'open';
create index if not exists itinerary_items_poll_idx
  on trip.itinerary_items (restaurant_poll_id) where restaurant_poll_id is not null;

create or replace function trip_private.can_access_restaurant_poll(p_poll_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from trip.restaurant_polls p
    join trip.trip_members m on m.trip_id = p.trip_id
    where p.id = p_poll_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function trip_private.can_edit_restaurant_poll(p_poll_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from trip.restaurant_polls p
    join trip.trip_members m on m.trip_id = p.trip_id
    where p.id = p_poll_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  );
$$;

alter table trip.restaurant_polls enable row level security;
grant select, insert, update, delete on trip.restaurant_polls to authenticated;
grant all on trip.restaurant_polls to service_role;

drop policy if exists restaurant_polls_select on trip.restaurant_polls;
create policy restaurant_polls_select on trip.restaurant_polls for select to authenticated
  using (trip_private.can_access_restaurant_poll(id));
drop policy if exists restaurant_polls_insert on trip.restaurant_polls;
create policy restaurant_polls_insert on trip.restaurant_polls for insert to authenticated
  with check (created_by = (select auth.uid()) and trip_private.can_edit_trip(trip_id));
drop policy if exists restaurant_polls_update on trip.restaurant_polls;
create policy restaurant_polls_update on trip.restaurant_polls for update to authenticated
  using (trip_private.can_edit_restaurant_poll(id)) with check (trip_private.can_edit_restaurant_poll(id));
drop policy if exists restaurant_polls_delete on trip.restaurant_polls;
create policy restaurant_polls_delete on trip.restaurant_polls for delete to authenticated
  using (trip_private.can_edit_restaurant_poll(id));

create or replace function trip_private.can_vote_for_item(p_item_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from trip.itinerary_items i
    join trip.restaurant_polls p on p.id = i.restaurant_poll_id
    join trip.trip_members m on m.trip_id = i.trip_id
    where i.id = p_item_id and i.type = 'food' and i.status = 'candidate'
      and i.deleted_at is null and p.status = 'open' and p.closes_at > now()
      and m.user_id = (select auth.uid())
  );
$$;

drop policy if exists restaurant_votes_insert on trip.restaurant_votes;
create policy restaurant_votes_insert on trip.restaurant_votes for insert to authenticated
  with check (
    user_id = (select auth.uid()) and trip_private.can_vote_for_item(item_id)
    and exists (
      select 1 from trip.itinerary_items i
      where i.id = item_id and i.restaurant_poll_id = poll_id
    )
  );

create or replace function trip.finalize_due_restaurant_polls()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_poll trip.restaurant_polls;
  v_winner uuid;
  v_count integer := 0;
begin
  for v_poll in
    select * from trip.restaurant_polls
    where status = 'open' and closes_at <= now()
    order by closes_at for update skip locked
  loop
    select i.id into v_winner
    from trip.itinerary_items i
    left join trip.restaurant_votes v on v.item_id = i.id and v.poll_id = v_poll.id
    where i.restaurant_poll_id = v_poll.id and i.status = 'candidate' and i.deleted_at is null
    group by i.id, i.created_at
    order by count(v.user_id) desc, i.created_at asc, i.id asc
    limit 1;

    if v_winner is not null then
      update trip.itinerary_items
      set status = case when id = v_winner then 'confirmed'::trip.itinerary_item_status else 'cancelled'::trip.itinerary_item_status end,
          start_at = v_poll.scheduled_at
      where restaurant_poll_id = v_poll.id and status = 'candidate';
    end if;

    update trip.restaurant_polls
    set status = 'finalized', winner_item_id = v_winner, finalized_at = now()
    where id = v_poll.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function trip.finalize_due_restaurant_polls() from public, anon;
grant execute on function trip.finalize_due_restaurant_polls() to authenticated, service_role;

-- Supabase Cron이 사용 가능한 프로젝트에서는 매분 종료 투표를 확정한다.
do $$ begin
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'trip-finalize-restaurant-polls') then
    perform cron.schedule('trip-finalize-restaurant-polls', '* * * * *', 'select trip.finalize_due_restaurant_polls()');
  end if;
exception when others then
  raise warning 'pg_cron schedule skipped: %', sqlerrm;
end $$;
