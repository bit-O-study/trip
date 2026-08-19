# 데이터베이스

## 이 DB는 헬쑤와 공유합니다

계정(`auth.users`)을 공유해 사용자가 두 앱에서 같은 아이디를 쓰게 하는 것이 목적입니다. 프로젝트 ref 는 `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 에 있습니다.

**계정은 공유하되 애플리케이션 테이블은 섞지 않습니다.**

| 스키마 | 용도 | API 노출 |
|---|---|---|
| `trip` | 앱 테이블·열거형 | 노출 |
| `trip_private` | SECURITY DEFINER 헬퍼 | **비노출** |
| `public` | 헬쑤 소유(테이블 49개). **건드리지 않는다** | 노출 |

### 절대 하면 안 되는 것

```sql
-- 헬쑤의 테이블 49개 권한을 전부 회수한다. 헬쑤가 즉시 죽는다.
revoke all on all tables in schema public from anon, authenticated;

-- profiles 같은 흔한 이름은 반드시 충돌한다.
create table public.profiles (...);
```

`... on all tables in schema public` 형태의 구문은 어떤 이유로도 쓰지 않습니다. 권한은 우리 테이블에만 겁니다.

문제가 생기면 `drop schema trip cascade` 로 우리 것만 되돌릴 수 있습니다.

### 헬쑤 profiles 공유

계정을 공유하므로 표시 이름도 헬쑤의 `public.profiles` 를 그대로 씁니다. **Trip 은 자체 프로필 테이블을 만들지 않습니다.** 같은 사람의 프로필이 두 벌 있으면 한쪽만 고쳤을 때 어느 쪽이 맞는지 알 수 없어집니다.

Trip 테이블은 모두 `auth.users` 를 참조하므로 프로필에 대한 FK 의존성은 없습니다.

### 왜 헬쑤 테이블에 정책을 추가하지 않는가

**RLS 는 행 단위라 컬럼을 가릴 수 없습니다.** 실제 `public.profiles` 는 컬럼이 28개이고 표시 이름 말고도 이런 것이 들어 있습니다.

```
phone, gender, experience, height_cm, weight_kg, body_fat_pct, muscle_mass_kg,
goal, target_weight_kg, target_body_fat_pct, target_muscle_kg, gym_id,
suspended_until, banned_at, ban_reason, withdrawn_at, must_change_password
```

"같은 여행 멤버끼리 읽기" 정책 한 줄이면 동행자가 상대의 **전화번호·체중·체지방률·정지 사유**까지 전부 읽습니다. 여행 앱이 알아야 하는 것은 표시 이름 하나뿐입니다.

### `trip.member_profiles` 뷰

대신 `trip` 스키마에 필요한 컬럼만 내보내는 뷰를 둡니다 (`20260819000006_member_profiles.sql`).

```ts
// 클라이언트 기본 스키마가 trip 이므로 그대로 읽으면 된다.
supabase.from("member_profiles").select("user_id, display_name")
```

- 노출 컬럼은 `user_id`, `display_name` **둘뿐**입니다. 헬쑤가 나중에 컬럼을 추가해도 새지 않습니다.
- `display_name` 은 `nickname` 우선, 없으면 `name` — 헬쑤의 표시 규칙과 같습니다.
- 뷰는 소유자 권한으로 실행되어 헬쑤의 "본인 행만" 정책을 우회하므로, 접근 통제를 `WHERE` 절에서 직접 합니다(본인 또는 같은 여행 멤버). `security_barrier` 로 조건이 먼저 평가되게 강제합니다.
- **헬쑤의 테이블·정책·권한을 전혀 건드리지 않습니다.** 되돌리려면 이 뷰만 지우면 됩니다.
- Supabase 린터가 "security definer view" 경고를 낼 수 있습니다. 의도된 것입니다.

`src/test/db/rls.test.ts` 가 검증하는 것: 동행자 이름 조회, 무관한 사용자 차단, 닉네임 폴백, **뷰가 민감 컬럼을 노출하지 않음**, 그리고 **헬쑤 원본 테이블은 여전히 본인 행만 보임**.

## 마이그레이션

`supabase/migrations/` 의 파일이 스키마의 유일한 출처입니다. 대시보드 SQL 에디터에서 직접 바꾸지 마세요. 마이그레이션과 실제 스키마가 갈라지면 다음 적용이 예상치 못한 결과를 냅니다.

| 파일 | 내용 |
|---|---|
| `20260819000001_schemas_and_enums.sql` | `trip` / `trip_private` 스키마, 열거형 |
| `20260819000002_core_tables.sql` | 테이블과 인덱스 |
| `20260819000003_functions_and_triggers.sql` | 멤버십 헬퍼, `updated_at`, owner 자동 등록, 마지막 owner 보호, 감사 기록 |
| `20260819000004_rls_policies.sql` | RLS 활성화, 권한(GRANT), 정책 |
| `20260819000005_storage.sql` | `trip-attachments` 버킷과 Storage 정책 |
| `20260819000006_member_profiles.sql` | 동행자 표시 이름 뷰 |
| `20260820000001_item_ordering.sql` | 일정 순서 계산·재배치 함수 |

모든 문장은 **재실행 가능**합니다. 적용 도중 실패해도 고친 뒤 통째로 다시 실행하면 됩니다. `src/test/db/idempotency.test.ts` 가 두 번 적용해도 데이터·정책이 유지되는지 검증합니다.

## 적용하기

### 자격증명

DDL 은 Postgres 에 직접 연결해야 실행됩니다. 서비스 역할 키로는 안 됩니다.
헬쑤와 DB 를 공유하므로 헬쑤가 쓰는 접속 정보를 그대로 씁니다 — `health_app/.env.test.local` 의 `SUPA_DB_HOST` / `SUPA_DB_PORT` / `SUPA_DB_REF` / `SUPA_DB_PW`.

**비밀번호를 이 저장소에 복사하지 않습니다.** 스크립트가 `--env-file` 로 그 파일을 읽습니다.

### 명령

```bash
# 변경 없이 현재 상태만 확인. 공유 DB 이므로 적용 전에 반드시 거친다.
npm run db:inspect -- --env-file ../../heltch/health_app/.env.test.local

# 적용. 파일 하나씩 트랜잭션으로 감싸므로 실패한 파일은 통째로 되돌아간다.
npm run db:apply -- --env-file ../../heltch/health_app/.env.test.local

# 결과 확인 (테이블, RLS, 뷰 컬럼, 헬쑤 권한 보존 여부)
npm run db:verify -- --env-file ../../heltch/health_app/.env.test.local
```

자격증명 없이 하려면 `npm run db:sql` 로 합본 SQL 을 만들어 대시보드 SQL Editor 에 붙여넣어도 됩니다.

### 적용 후 필수 설정

1. **Settings → API → Exposed schemas 에 `trip` 추가.**
   빠뜨리면 모든 질의가 `PGRST106` 으로 실패합니다. **`trip_private` 는 추가하지 마세요** — 내부 헬퍼가 RPC 로 열립니다.

   > `npm run db:expose` 로도 가능하지만 이는 `authenticator` 역할의 전역 설정을 바꾸는 것이라 **헬쑤 API 에 함께 영향**을 줍니다. 스크립트는 현재 목록을 읽어 `trip` 만 덧붙이지만, 대시보드에서 하는 편이 안전합니다.

2. Authentication → URL Configuration 의 Redirect URLs 에 `http://localhost:3100/auth/callback` 과 운영 도메인 callback 추가
3. Google/Kakao 개발자 콘솔의 OAuth callback 에 `https://<ref>.supabase.co/auth/v1/callback` (헬쑤가 이미 등록했다면 그대로 사용)
4. `trip-attachments` 버킷이 **private** 인지 확인
5. **헬쑤가 정상 동작하는지 확인** — 공유 DB 를 건드린 뒤에는 반드시 상대 앱을 함께 점검합니다

### 현재 노출 스키마 확인법

PostgREST 가 직접 알려줍니다. 노출되지 않은 스키마로 요청하면 오류에 전체 목록이 들어 있습니다.

```bash
curl -s "$SUPABASE_URL/rest/v1/trips?select=*&limit=0" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Accept-Profile: trip"
# {"code":"PGRST106", "hint":"Only the following schemas are exposed: public, graphql_public", ...}
```

## RLS 테스트

```bash
npm test            # RLS 테스트 포함 전체 단위 테스트
```

이 개발 환경에는 Docker 가 없어 `supabase start` 로 로컬 DB 를 띄울 수 없습니다. 대신 **PGlite**(Postgres 를 WASM 으로 컴파일한 것)를 Node 안에서 띄우고, 같은 마이그레이션 파일을 그대로 적용한 뒤 RLS 를 검증합니다. 하네스는 `src/test/db/harness.ts` 입니다.

하네스는 Supabase 가 제공하는 것 중 마이그레이션이 의존하는 최소 집합만 흉내 냅니다.

- 역할: `anon`, `authenticated`, `service_role`(BYPASSRLS)
- `auth.users` 테이블과 `auth.uid()`
- `storage.buckets` / `storage.objects` (RLS 활성 상태)
- 헬쑤의 `public.profiles` (실제 컬럼과 "본인 행만" 정책을 재현)

### 한계

- PGlite 의 Postgres 버전이 Supabase 운영 버전과 다를 수 있습니다.
- 실제 `auth` / `storage` 스키마는 위 최소 집합보다 훨씬 큽니다.
- PostgREST 계층(노출 스키마 설정, 요청 헤더 → JWT 클레임 변환)은 검증되지 않습니다.

정책 로직 검증에는 충분하지만, **적용한 뒤 최소 한 번은 실제 환경에서 권한 거부 케이스를 확인**해야 합니다.

## 설계상 주의점

**`INSERT ... RETURNING` 은 SELECT 정책도 통과해야 합니다.** `trips` 의 SELECT 정책이 멤버십만 검사하면, 생성자를 owner 로 등록하는 AFTER 트리거가 RETURNING 계산 이후에 실행되기 때문에 "여행을 만들고 id 를 돌려받는" 기본 흐름이 실패합니다. 그래서 정책에 `owner_id = auth.uid()` 조건이 함께 들어 있습니다. 새 테이블에 정책을 추가할 때 같은 문제를 확인하세요.

**`sort_order` 는 `numeric` 입니다.** `1000, 2000, ...` 간격으로 배치하고 중간 삽입은 양옆 값의 중간값을 씁니다. 계산은 클라이언트가 아니라 `trip.move_item` / `trip.next_sort_order` 가 원자적으로 합니다. 읽고-계산하고-쓰는 사이에 다른 사람이 같은 위치로 옮기면 두 항목이 같은 값을 갖기 때문입니다.

**동시 편집은 낙관적 잠금으로 처리합니다.** 저장 전에 `updated_at` 을 조회해 비교하면 경쟁 조건을 막지 못합니다. 비교를 `UPDATE` 문의 조건에 넣고, 영향받은 행이 0건이면 충돌로 처리하세요.

```sql
update trip.itinerary_items
set    title = $1, updated_at = now()
where  id = $2
  and  updated_at = $3
  and  deleted_at is null;
```
