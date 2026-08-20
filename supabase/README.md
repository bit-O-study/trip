# 데이터베이스

Trip은 전용 Supabase 프로젝트를 사용합니다. 앱 테이블과 공개 프로필은 `trip`, SECURITY DEFINER 헬퍼는 `trip_private` 스키마에 둡니다. `public`에는 앱 테이블을 만들지 않습니다.

| 스키마 | 용도 | API 노출 |
|---|---|---|
| `trip` | 앱 테이블·프로필·열거형 | 노출 |
| `trip_private` | SECURITY DEFINER 헬퍼 | 비노출 |
| `public` | Supabase 기본 영역 | 기본값 유지 |

## 프로필

`trip.profiles`는 `user_id`, `display_name`, `avatar_url`과 생성·수정 시각만 저장합니다. `auth.users`에 사용자가 생기면 트리거가 OAuth 메타데이터 또는 이메일에서 표시 이름을 골라 프로필을 자동 생성합니다.

- 본인은 자신의 프로필을 조회·생성·수정할 수 있습니다.
- 같은 여행 멤버는 서로의 프로필을 조회할 수 있습니다.
- 타인의 프로필 수정과 익명 조회는 거부됩니다.
- 프로필 삭제는 `auth.users` 삭제에 따른 cascade만 허용합니다.

## 마이그레이션

`supabase/migrations/`가 스키마의 유일한 출처입니다. 대시보드 SQL Editor에서 임의로 스키마를 변경하지 않습니다.

| 파일 | 내용 |
|---|---|
| `20260819000001_schemas_and_enums.sql` | `trip` / `trip_private` 스키마, 열거형 |
| `20260819000002_core_tables.sql` | 프로필과 앱 테이블, 인덱스 |
| `20260819000003_functions_and_triggers.sql` | 프로필 생성, 멤버십 헬퍼, 갱신·감사 트리거 |
| `20260819000004_rls_policies.sql` | RLS, GRANT, 정책 |
| `20260819000005_storage.sql` | private `trip-attachments` 버킷과 정책 |
| `20260820000001_item_ordering.sql` | 일정 순서 계산·재배치 함수 |

```bash
npm test
npm run db:inspect -- --env-file .env.local
npm run db:apply -- --env-file .env.local
npm run db:verify -- --env-file .env.local
```

DDL 적용에는 publishable key나 service-role key가 아니라 새 프로젝트의 DB 접속 정보가 필요합니다. `.env.local`에 `SUPABASE_DB_URL`을 설정합니다. 비밀값은 커밋하지 않습니다.

SQL만 생성해 대시보드에서 검토하려면 `npm run db:sql`을 사용합니다.

## 대시보드 필수 설정

1. Settings → API → Exposed schemas에 `trip`만 추가합니다. `trip_private`은 노출하지 않습니다.
2. Authentication → URL Configuration을 설정합니다.
   - Site URL: `https://trip-planner-tau-jade.vercel.app`
   - Redirect URL: `http://localhost:3100/auth/callback`
   - Redirect URL: `https://trip-planner-tau-jade.vercel.app/auth/callback`
   - Redirect URL: `https://trip-planner-*.vercel.app/auth/callback`
3. Google/Kakao 개발자 콘솔에는 `https://mtocrrzmhucrrkcqxxeo.supabase.co/auth/v1/callback`을 OAuth callback으로 등록합니다.
4. Storage의 `trip-attachments` 버킷이 private인지 확인합니다.

## 테스트 하네스

RLS 테스트는 PGlite에서 Supabase의 `auth`, `storage`, 역할을 최소한으로 재현한 뒤 실제 마이그레이션을 적용합니다. 정책 로직에는 충분하지만, 배포 전 실제 Supabase에서도 권한 거부 사례를 확인합니다.

특히 소유자·편집자·조회자 권한, 무관한 사용자와 익명 사용자 거부, 타인 프로필 수정 거부, Storage 정책, 토큰 로그 유출 방지, 마이그레이션 재실행 안전성을 검증합니다.
