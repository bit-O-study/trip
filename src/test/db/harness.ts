import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

/**
 * RLS 테스트용 인메모리 Postgres.
 *
 * 이 개발 환경에는 Docker 가 없어 `supabase start` 로 로컬 DB 를 띄울 수 없다.
 * PGlite 는 Postgres 를 WASM 으로 컴파일한 것이라 Node 안에서 그대로 돌아가고,
 * RLS·역할 전환·SECURITY DEFINER 가 실제 Postgres 와 동일하게 동작한다.
 *
 * 한계: PGlite 의 Postgres 버전이 Supabase 운영 버전과 다를 수 있고,
 * Supabase 의 auth 스키마는 아래에서 최소한으로만 흉내 낸다. 정책 로직 검증에는
 * 충분하지만, 운영 프로젝트에 적용한 뒤 한 번은 실제 환경에서 확인해야 한다.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Supabase 가 제공하는 것 중 마이그레이션이 의존하는 최소 집합.
 * 마이그레이션보다 먼저 적용해야 한다 (auth.users 를 FK 로 참조하므로).
 */
const SUPABASE_SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  -- 운영 환경과 동일하게 service_role 은 RLS 를 우회한다.
  create role service_role nologin bypassrls;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;

  create table auth.users (
    id    uuid primary key,
    email text
  );

  -- Supabase 의 auth.uid() 는 JWT 클레임에서 사용자 id 를 읽는다.
  -- 테스트에서는 세션 설정으로 대신한다.
  create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant execute on function auth.uid() to anon, authenticated, service_role;

  -- Supabase Storage. 실제 환경에서는 이 테이블들이 이미 존재하고 RLS 가 켜져
  -- 있으며 권한도 부여돼 있다. 마이그레이션은 정책과 버킷만 추가한다.
  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;

  create table storage.buckets (
    id     text primary key,
    name   text not null,
    public boolean not null default false
  );

  create table storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text references storage.buckets (id),
    name       text not null,
    owner      uuid,
    created_at timestamptz not null default now()
  );

  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to authenticated;
  grant all on storage.objects, storage.buckets to service_role;

  -- 헬쑤(health_app)의 public.profiles.
  -- Trip 은 이 테이블을 만들지도 고치지도 않지만 trip.member_profiles 뷰가
  -- 읽는다. 실제 컬럼 이름·타입과 "본인 행만" RLS 를 그대로 재현해야
  -- 뷰가 의도대로 동작하는지 검증할 수 있다.
  -- 출처: C:/git/heltch/health_app/supabase/schema.sql
  create table public.profiles (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    gender      text,
    experience  text,
    name        text,
    nickname    text,
    phone       text,
    weight_kg   numeric(5, 1),
    banned_at   timestamptz,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
  );

  alter table public.profiles enable row level security;
  grant select, insert, update on public.profiles to authenticated;

  -- 헬쑤의 기존 정책: 본인 행만 읽는다.
  create policy "Users can read own profile"
    on public.profiles for select
    using (auth.uid() = user_id);
  create policy "Users can insert own profile"
    on public.profiles for insert
    with check (auth.uid() = user_id);
`;

export type TestDb = {
  pg: PGlite;
  /** 해당 사용자로 질의한다 (authenticated 역할 + auth.uid()). */
  asUser: (userId: string) => Promise<void>;
  /** 로그인하지 않은 방문자로 질의한다. */
  asAnon: () => Promise<void>;
  /** RLS 를 우회하는 서버 경로를 흉내 낸다. */
  asService: () => Promise<void>;
  /** 세션 사용자(superuser)로 되돌린다. 픽스처 준비용. */
  asSuperuser: () => Promise<void>;
  /** auth.users 에 사용자를 만든다. */
  createUser: (userId: string, email?: string) => Promise<void>;
  /** public 스키마의 모든 데이터를 지운다. */
  truncateAll: () => Promise<void>;
};

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();

  await pg.exec(SUPABASE_SHIM);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    throw new Error(`마이그레이션을 찾지 못했습니다: ${MIGRATIONS_DIR}`);
  }

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await pg.exec(sql);
    } catch (error) {
      throw new Error(`마이그레이션 실패: ${file}\n${(error as Error).message}`);
    }
  }

  const asSuperuser = async () => {
    await pg.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  };

  const asUser = async (userId: string) => {
    await asSuperuser();
    await pg.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await pg.exec("set role authenticated;");
  };

  const asAnon = async () => {
    await asSuperuser();
    await pg.exec("set role anon;");
  };

  const asService = async () => {
    await asSuperuser();
    await pg.exec("set role service_role;");
  };

  const createUser = async (userId: string, email?: string) => {
    await asSuperuser();
    await pg.query("insert into auth.users (id, email) values ($1, $2)", [
      userId,
      email ?? `${userId}@example.test`,
    ]);
  };

  const truncateAll = async () => {
    await asSuperuser();
    await pg.exec(`
      truncate table storage.objects;
      truncate table
        trip.audit_events,
        trip.attachments,
        trip.itinerary_items,
        trip.trip_share_links,
        trip.trip_invites,
        trip.trip_members,
        trip.trips,
        trip.places,
        trip.flights,
        public.profiles,
        auth.users
      restart identity cascade;
    `);
  };

  return { pg, asUser, asAnon, asService, asSuperuser, createUser, truncateAll };
}

/** 테스트 안에서 사람이 읽기 쉬운 고정 UUID. */
export const USER = {
  owner: "00000000-0000-4000-8000-000000000001",
  editor: "00000000-0000-4000-8000-000000000002",
  viewer: "00000000-0000-4000-8000-000000000003",
  stranger: "00000000-0000-4000-8000-000000000004",
  coOwner: "00000000-0000-4000-8000-000000000005",
} as const;

/**
 * 질의가 거부되는지 확인한다.
 *
 * 권한 부족(GRANT 없음)과 정책 위반(WITH CHECK 실패)은 모두 42501 로 온다.
 * 둘을 구분하지 않는 이유는 호출자 입장에서 결과가 같기 때문이다 — 쓸 수 없다.
 */
export async function expectDenied(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("거부될 것으로 예상했지만 성공했습니다");
}
