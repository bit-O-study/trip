# 데이터베이스

## 이 DB는 헬쑤와 공유합니다

계정(`auth.users`)을 공유해 사용자가 두 앱에서 같은 아이디를 쓰게 하는 것이 목적입니다. 프로젝트 ref 는 `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 에 있습니다.

**계정은 공유하되 애플리케이션 테이블은 섞지 않습니다.**

| 스키마 | 용도 | API 노출 |
|---|---|---|
| `trip` | 앱 테이블·열거형 | 노출 (대시보드 설정 필요) |
| `trip_private` | SECURITY DEFINER 헬퍼 | **비노출** |
| `public` | 헬쑤 소유. **건드리지 않는다** | — |

### 헬쑤 profiles 공유

계정을 공유하므로 표시 이름·아바타도 헬쑤의 `public.profiles` 를 그대로 씁니다. **Trip 은 자체 프로필 테이블을 만들지 않습니다.** 같은 사람의 프로필이 두 벌 있으면 한쪽만 고쳤을 때 어느 쪽이 맞는지 알 수 없어집니다.

Trip 테이블은 모두 `auth.users` 를 참조하므로 프로필에 대한 스키마 의존성은 없습니다. 읽을 때만 스키마를 명시합니다 (클라이언트 기본 스키마가 `trip` 이므로).

```ts
supabase.schema("public").from("profiles").select("id, display_name, avatar_url")
```

**아직 하지 않은 일** — 동행자 목록에 표시 이름을 보여주려면 헬쑤의 `public.profiles` 에 "같은 여행 멤버끼리 읽을 수 있다" 정책을 추가해야 합니다. 헬퍼(`trip_private.shares_trip_with`)는 준비돼 있지만, **상대 앱 테이블을 건드리는 일이라 아직 마이그레이션으로 만들지 않았습니다.** 다음을 먼저 확인하세요.

1. `public.profiles` 가 실제로 존재하는지, 컬럼 이름이 무엇인지 (`display_name` 이 아닐 수 있음)
2. 기존 RLS 정책 — 정책은 OR 로 합쳐지므로 추가가 헬쑤 기능을 깨지는 않지만, **헬쑤 사용자의 프로필이 Trip 동행자에게 보이게 되는 노출 범위 변경**입니다. 헬쑤 쪽 합의가 필요합니다.
3. 추가 후 헬쑤 정상 동작 점검

확인이 끝나면 대략 아래 형태가 됩니다. **컬럼·정책 이름은 실제 스키마를 보고 맞춰야 합니다.**

```sql
-- 예시. 그대로 실행하지 마세요.
create policy trip_members_can_read_profile on public.profiles
  for select to authenticated
  using (trip_private.shares_trip_with(id));
```

### 절대 하면 안 되는 것

```sql
-- 헬쑤의 모든 테이블 권한까지 회수한다. 헬쑤가 즉시 죽는다.
revoke all on all tables in schema public from anon, authenticated;

-- profiles 같은 흔한 이름은 반드시 충돌한다.
create table public.profiles (...);
```

`... on all tables in schema public` 형태의 구문은 어떤 이유로도 쓰지 않습니다. 권한은 우리 테이블에만 겁니다.

문제가 생기면 `drop schema trip cascade` 로 우리 것만 되돌릴 수 있습니다.

## 마이그레이션

`supabase/migrations/` 의 파일이 스키마의 유일한 출처입니다. 대시보드 SQL 에디터에서 직접 바꾸지 마세요. 마이그레이션과 실제 스키마가 갈라지면 다음 `db push` 가 예상치 못한 결과를 냅니다.

| 파일 | 내용 |
|---|---|
| `20260819000001_schemas_and_enums.sql` | `trip` / `trip_private` 스키마, 열거형 |
| `20260819000002_core_tables.sql` | 테이블과 인덱스 |
| `20260819000003_functions_and_triggers.sql` | 멤버십 헬퍼, `updated_at`, owner 자동 등록, 마지막 owner 보호, 감사 기록 |
| `20260819000004_rls_policies.sql` | RLS 활성화, 권한(GRANT), 정책 |
| `20260819000005_storage.sql` | `trip-attachments` 버킷과 Storage 정책 |

## 적용하기

### 1. 자격증명 준비

`db push` 는 Postgres 에 직접 DDL 을 실행합니다. 서비스 역할 키로는 안 됩니다.

```bash
# 개인 액세스 토큰 (대시보드 → Account → Access Tokens)
export SUPABASE_ACCESS_TOKEN=sbp_...

# 또는 접속 문자열을 직접 쓰기 (대시보드 → Settings → Database → Connection string)
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
```

### 2. 적용

```bash
npm run db:link      # 프로젝트 ref 입력
npm run db:push      # 마이그레이션 적용
npm run db:status    # 로컬/원격 마이그레이션 상태 비교
```

> 공유 DB 이므로 **먼저 `supabase db diff` 로 무엇이 바뀌는지 확인**하고, 가능하면 헬쑤 트래픽이 적은 시간에 적용하세요.

### 3. 적용 후 필수 설정

1. **Settings → API → Exposed schemas 에 `trip` 추가.** 이걸 빼면 모든 질의가 404 로 실패합니다. `trip_private` 는 **추가하지 마세요** — 헬퍼가 RPC 로 노출됩니다.
2. Authentication → URL Configuration 의 Redirect URLs 에 `http://localhost:3100/auth/callback` 과 운영 도메인 callback 추가
3. Google/Kakao 개발자 콘솔의 OAuth callback 에 `https://<ref>.supabase.co/auth/v1/callback` 추가 (헬쑤가 이미 등록해 뒀다면 그대로 씁니다)
4. `trip-attachments` 버킷이 **private** 인지 확인
5. 헬쑤가 정상 동작하는지 확인 — 공유 DB 를 건드린 뒤에는 반드시 상대 앱을 함께 점검합니다

## RLS 테스트

```bash
npm test            # RLS 테스트 포함 전체 단위 테스트
```

이 개발 환경에는 Docker 가 없어 `supabase start` 로 로컬 DB 를 띄울 수 없습니다. 대신 **PGlite**(Postgres 를 WASM 으로 컴파일한 것)를 Node 안에서 띄우고, 같은 마이그레이션 파일을 그대로 적용한 뒤 RLS 를 검증합니다. 하네스는 `src/test/db/harness.ts`, 테스트는 `src/test/db/rls.test.ts` 입니다.

하네스는 Supabase 가 제공하는 것 중 마이그레이션이 의존하는 최소 집합만 흉내 냅니다.

- 역할: `anon`, `authenticated`, `service_role`(BYPASSRLS)
- `auth.users` 테이블과 `auth.uid()`
- `storage.buckets` / `storage.objects` (RLS 활성 상태)

### 한계

- PGlite 의 Postgres 버전이 Supabase 운영 버전과 다를 수 있습니다.
- 실제 `auth` / `storage` 스키마는 위 최소 집합보다 훨씬 큽니다.
- PostgREST 계층(노출 스키마 설정, 요청 헤더 → JWT 클레임 변환)은 검증되지 않습니다.
- **헬쑤의 기존 스키마와의 충돌은 검증할 수 없습니다.** 하네스에는 헬쑤 테이블이 없기 때문입니다. 적용 전 `supabase db diff` 로 확인하세요.

정책 로직 검증에는 충분하지만, **적용한 뒤 최소 한 번은 실제 환경에서 권한 거부 케이스를 확인**해야 합니다.

## 설계상 주의점

**`INSERT ... RETURNING` 은 SELECT 정책도 통과해야 합니다.** `trips` 의 SELECT 정책이 멤버십만 검사하면, 생성자를 owner 로 등록하는 AFTER 트리거가 RETURNING 계산 이후에 실행되기 때문에 "여행을 만들고 id 를 돌려받는" 기본 흐름이 실패합니다. 그래서 정책에 `owner_id = auth.uid()` 조건이 함께 들어 있습니다. 새 테이블에 정책을 추가할 때 같은 문제를 확인하세요.

**`sort_order` 는 `numeric` 입니다.** 연속 정수가 아니라 `1000, 2000, ...` 간격으로 배치하고, 중간 삽입은 양옆 값의 중간값을 계산합니다. 인접 값의 차이가 `0.000001` 미만이 되면 해당 `(trip_id, 날짜)` 범위만 재번호화합니다.

**동시 편집은 낙관적 잠금으로 처리합니다.** 저장 전에 `updated_at` 을 조회해 비교하면 경쟁 조건을 막지 못합니다. 비교를 `UPDATE` 문의 조건에 넣고, 영향받은 행이 0건이면 충돌로 처리하세요.

```sql
update trip.itinerary_items
set    title = $1, updated_at = now()
where  id = $2
  and  updated_at = $3
  and  deleted_at is null;
```
