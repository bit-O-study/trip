-- 핵심 테이블
--
-- 규칙
--  - 모든 시각은 timestamptz(UTC). 표시할 때만 현지 시간대로 변환한다.
--  - 좌표는 WGS84 하나만 저장한다.
--  - 사용자 데이터를 담는 테이블에는 deleted_at 을 두어 soft delete 한다.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users (id) on delete restrict,
  title            text not null check (length(btrim(title)) > 0),
  description      text,
  cover_image_url  text,
  destination_name text,
  start_date       date not null,
  end_date         date not null,
  -- 여행지 시간대. 일정 표시의 기준이며 IANA 이름을 저장한다 ("Asia/Tokyo").
  timezone         text not null default 'Asia/Seoul',
  base_currency    char(3) not null default 'KRW',
  status           public.trip_status not null default 'planning',
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint trips_date_range check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- trip_members
-- ---------------------------------------------------------------------------
create table public.trip_members (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      public.trip_member_role not null default 'viewer',
  joined_at timestamptz not null default now(),

  primary key (trip_id, user_id)
);

-- ---------------------------------------------------------------------------
-- trip_invites — 회원 초대 (계정에 귀속)
-- ---------------------------------------------------------------------------
create table public.trip_invites (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid not null references public.trips (id) on delete cascade,
  created_by  uuid not null references auth.users (id) on delete cascade,
  -- 원문 토큰은 저장하지 않는다. 단방향 해시만 보관한다.
  token_hash  text not null unique,
  role        public.trip_member_role not null default 'editor',
  max_uses    integer not null default 1 check (max_uses > 0),
  used_count  integer not null default 0 check (used_count >= 0),
  expires_at  timestamptz,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint trip_invites_uses_within_limit check (used_count <= max_uses),
  -- owner 권한을 초대로 넘기지 않는다. 소유권 이전은 별도 경로를 쓴다.
  constraint trip_invites_role_not_owner check (role <> 'owner')
);

-- ---------------------------------------------------------------------------
-- trip_share_links — 공개 읽기 링크 (계정 무관)
--
-- trip_invites 와 역할이 달라 테이블을 분리한다. 하나로 합치면 만료·폐기·권한
-- 정책이 뒤섞인다.
-- ---------------------------------------------------------------------------
create table public.trip_share_links (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  created_by       uuid not null references auth.users (id) on delete cascade,
  token_hash       text not null unique,
  -- 토큰 없는 공유 URL(/s/[tripShortId])에 쓰는 공개 식별자.
  short_id         text not null unique,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  last_accessed_at timestamptz,
  access_count     bigint not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- places — 정규화된 공유 엔티티. 갱신해도 안전하다.
--
-- 저장된 일정의 불변성은 itinerary_items.place_snapshot 이 보장하므로
-- 이 테이블은 최신 정보로 갱신할 수 있다.
-- ---------------------------------------------------------------------------
create table public.places (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null check (provider in ('kakao', 'naver', 'manual')),
  provider_place_id text not null,
  name              text not null,
  category          text,
  category_group    public.place_category_group not null default 'etc',
  address           text,
  road_address      text,
  phone             text,
  url               text,
  -- WGS84. Kakao Local API 의 x=경도, y=위도를 수집 즉시 이 형태로 정규화한다.
  latitude          numeric(10, 7) not null check (latitude between -90 and 90),
  longitude         numeric(10, 7) not null check (longitude between -180 and 180),
  raw               jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  last_fetched_at   timestamptz not null default now(),

  unique (provider, provider_place_id)
);

-- ---------------------------------------------------------------------------
-- flights — 정규화된 공유 엔티티
-- ---------------------------------------------------------------------------
create table public.flights (
  id                       uuid primary key default gen_random_uuid(),
  provider                 text not null
    check (provider in ('kac_gw', 'aerodatabox', 'manual')),
  provider_flight_id       text,

  -- 코드셰어 대응: 판매 편명과 운항 편명을 분리한다.
  -- 분리하지 않으면 같은 항공편이 두 편명으로 각각 등록되어 중복이 생긴다.
  marketing_flight_number  text not null,
  operating_flight_number  text,
  -- 사용자가 입력한 원문. 선행 0을 포함해 그대로 보존한다(표시용).
  flight_number_input      text,
  -- 공급자 조회용 정규화 값(공백 제거·대문자·선행 0 제거).
  flight_number_key        text not null,

  airline_code             text,
  operating_airline_code   text,

  departure_airport        text not null check (length(departure_airport) = 3),
  departure_terminal       text,
  departure_gate           text,
  -- 공항별 시간대를 행에 저장한다. 조회 시점마다 계산하면 공항 데이터가 바뀔 때
  -- 과거 일정의 표시가 흔들린다.
  departure_timezone       text not null,

  arrival_airport          text not null check (length(arrival_airport) = 3),
  arrival_terminal         text,
  arrival_gate             text,
  arrival_timezone         text not null,

  scheduled_departure      timestamptz not null,
  estimated_departure      timestamptz,
  actual_departure         timestamptz,
  scheduled_arrival        timestamptz not null,
  estimated_arrival        timestamptz,
  actual_arrival           timestamptz,

  status                   public.flight_status not null default 'scheduled',
  raw                      jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  fetched_at               timestamptz not null default now()

  -- 날짜변경선을 넘는 노선은 도착이 출발보다 이른 현지시각일 수 있다.
  -- timestamptz 기준으로도 도착 < 출발 인 경우를 오류로 막지 않는다:
  -- 공급자 데이터 오류로 일정 저장 자체가 실패하는 편이 더 나쁘다.
);

-- ---------------------------------------------------------------------------
-- itinerary_items — 모든 일정 항목이 여기로 들어온다
-- ---------------------------------------------------------------------------
create table public.itinerary_items (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  created_by       uuid references auth.users (id) on delete set null,

  type             public.itinerary_item_type not null,
  status           public.itinerary_item_status not null default 'confirmed',
  source           public.itinerary_item_source not null default 'manual',
  share_visibility public.share_visibility not null default 'visible',

  title            text not null check (length(btrim(title)) > 0),
  note             text,
  -- place 없이 위치만 적는 경우 ("공항 3층 만남의 광장")
  location_text    text,

  start_at         timestamptz not null,
  end_at           timestamptz,
  timezone         text,
  all_day          boolean not null default false,

  -- 같은 시각대 항목의 수동 순서. 연속 정수가 아니라 간격 배치(1000, 2000...)를
  -- 쓰고 중간 삽입은 양옆 중간값을 계산한다. numeric 은 임의 정밀도라
  -- 중간값이 고갈되지 않는다. 자릿수가 과도해지면 해당 날짜만 재번호화한다.
  sort_order       numeric not null default 1000,

  place_id         uuid references public.places (id) on delete set null,
  -- 선택 시점의 불변 사본. 외부 API 결과가 바뀌거나 사라져도 일정이 유지된다.
  place_snapshot   jsonb,

  flight_id        uuid references public.flights (id) on delete set null,
  flight_snapshot  jsonb,

  reservation_code text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,

  constraint itinerary_items_time_range check (end_at is null or end_at >= start_at)
);

-- ---------------------------------------------------------------------------
-- attachments — 티켓·바우처·사진
-- ---------------------------------------------------------------------------
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  item_id      uuid references public.itinerary_items (id) on delete cascade,
  uploaded_by  uuid references auth.users (id) on delete set null,
  -- Storage object 경로. 첫 세그먼트가 trip_id 여야 Storage RLS 에서
  -- 멤버십 검사를 걸 수 있다.
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null check (size_bytes >= 0),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint attachments_path_scoped_to_trip
    check (storage_path like trip_id::text || '/%')
);

-- ---------------------------------------------------------------------------
-- audit_events — 초대·권한·공유 링크 변경 기록
--
-- 일반 사용자는 INSERT/UPDATE/DELETE 할 수 없다. 생성은 트리거나 서버 전용
-- 함수만 수행한다. 클라이언트가 직접 쓸 수 있으면 기록을 신뢰할 수 없다.
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id          bigint generated always as identity primary key,
  trip_id     uuid not null references public.trips (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 인덱스
-- ---------------------------------------------------------------------------

-- 타임라인 조회의 기본 정렬. soft delete 된 행은 대부분의 조회에서 빠지므로
-- 부분 인덱스로 크기를 줄인다.
create index itinerary_items_trip_time_idx
  on public.itinerary_items (trip_id, start_at, sort_order)
  where deleted_at is null;

create index itinerary_items_place_idx on public.itinerary_items (place_id);
create index itinerary_items_flight_idx on public.itinerary_items (flight_id);

-- "내가 속한 여행" 조회. RLS 헬퍼가 매 질의마다 타므로 중요하다.
create index trip_members_user_idx on public.trip_members (user_id, trip_id);

create index trips_owner_idx on public.trips (owner_id) where deleted_at is null;

create index flights_lookup_idx
  on public.flights (flight_number_key, scheduled_departure);

create index attachments_trip_idx on public.attachments (trip_id)
  where deleted_at is null;

create index audit_events_trip_idx on public.audit_events (trip_id, created_at desc);

create index trip_invites_trip_idx on public.trip_invites (trip_id);
create index trip_share_links_trip_idx on public.trip_share_links (trip_id);
