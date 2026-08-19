# 데이터베이스

## 마이그레이션

`supabase/migrations/` 의 파일이 스키마의 유일한 출처입니다. Supabase 대시보드의 SQL 에디터에서 직접 스키마를 바꾸지 마세요. 그렇게 하면 마이그레이션과 실제 스키마가 갈라지고, 다음 `db push` 가 예상치 못한 결과를 냅니다.

| 파일 | 내용 |
|---|---|
| `20260819000001_schemas_and_enums.sql` | `private` 스키마, 열거형 |
| `20260819000002_core_tables.sql` | 테이블과 인덱스 |
| `20260819000003_functions_and_triggers.sql` | 멤버십 헬퍼, `updated_at`, owner 자동 등록, 마지막 owner 보호, 감사 기록 |
| `20260819000004_rls_policies.sql` | RLS 활성화, 권한(GRANT), 정책 |
| `20260819000005_storage.sql` | 첨부파일 버킷과 Storage 정책 |

## 운영 프로젝트에 적용하기

> Trip 전용 Supabase 프로젝트가 먼저 있어야 합니다. **참고 앱(Health) 프로젝트에 적용하지 마세요.**

```bash
npm run db:link      # 프로젝트 ref 를 물어봅니다
npm run db:push      # 마이그레이션 적용
npm run db:status    # 로컬/원격 마이그레이션 상태 비교
```

적용 후 확인할 것:

1. Authentication → URL Configuration 의 Redirect URLs 에 `http://localhost:3100/auth/callback` 과 운영 도메인 callback 등록
2. Google/Kakao 개발자 콘솔의 OAuth callback 에 `https://<project-ref>.supabase.co/auth/v1/callback` 등록
3. `trip-attachments` 버킷이 **private** 인지 확인
4. Storage 정책이 적용됐는지 확인 (`storage.objects` 의 `trip_attachments_*`)

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
- PostgREST 계층(스키마 노출 범위, 요청 헤더 → JWT 클레임 변환)은 검증되지 않습니다.

정책 로직 검증에는 충분하지만, **운영 프로젝트에 적용한 뒤 최소 한 번은 실제 환경에서 권한 거부 케이스를 확인**해야 합니다.

## 설계상 주의점

**`INSERT ... RETURNING` 은 SELECT 정책도 통과해야 합니다.** `trips` 의 SELECT 정책이 멤버십만 검사하면, 생성자를 owner 로 등록하는 AFTER 트리거가 RETURNING 계산 이후에 실행되기 때문에 "여행을 만들고 id 를 돌려받는" 기본 흐름이 실패합니다. 그래서 정책에 `owner_id = auth.uid()` 조건이 함께 들어 있습니다. 새 테이블에 정책을 추가할 때 같은 문제를 확인하세요.

**`sort_order` 는 `numeric` 입니다.** 연속 정수가 아니라 `1000, 2000, ...` 간격으로 배치하고, 중간 삽입은 양옆 값의 중간값을 계산합니다. 인접 값의 차이가 `0.000001` 미만이 되면 해당 `(trip_id, 날짜)` 범위만 재번호화합니다.

**동시 편집은 낙관적 잠금으로 처리합니다.** 저장 전에 `updated_at` 을 조회해 비교하면 경쟁 조건을 막지 못합니다. 비교를 `UPDATE` 문의 조건에 넣고, 영향받은 행이 0건이면 충돌로 처리하세요.

```sql
update public.itinerary_items
set    title = $1, updated_at = now()
where  id = $2
  and  updated_at = $3
  and  deleted_at is null;
```
