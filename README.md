# Trip Planner

항공편, 숙소, 맛집과 자유 일정을 한 타임라인에서 관리하는 여행 일정 앱입니다.

상세 설계는 [docs/architecture.md](docs/architecture.md), 외부 공급자 결정은 [docs/adr/](docs/adr/)를 참고하세요.

## 시작하기

```bash
npm install
npm run dev        # http://localhost:3100
```

> **개발 서버 포트는 3100입니다.** 이 머신의 3000번은 다른 프로젝트가 쓰고 있고, Next.js는 포트가 막히면 조용히 다음 번호로 옮겨갑니다. 포트가 매번 달라지면 OAuth redirect URL 등록이 어긋나므로 고정했습니다.

## 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run check` | lint + 타입 검사 + 단위 테스트 |
| `npm test` | 단위 테스트 (Vitest) |
| `npm run test:e2e` | E2E 테스트 (프로덕션 빌드 대상, 모바일·데스크톱 뷰포트) |
| `npm run test:e2e:dev` | E2E 테스트 (dev 서버 대상, 화면 수정 중 빠른 확인용) |
| `npm run build` | 프로덕션 빌드 |
| `npm run db:push` | 마이그레이션을 Supabase 프로젝트에 적용 ([supabase/README.md](supabase/README.md)) |

E2E는 처음 한 번 브라우저 설치가 필요합니다.

```bash
npx playwright install chromium
```

## 진행 상황

구현 순서는 [docs/architecture.md](docs/architecture.md) 8절을 따릅니다.

- [x] 1단계 — Next.js 기본 앱, 모바일 우선 레이아웃, lint/test 구성
- [x] 2단계 — SQL migration과 RLS 테스트 (Supabase 프로젝트 생성 후 `npm run db:push` 필요)
- [x] 3단계 코드 — Supabase SSR 클라이언트·세션 proxy·로그인 UI·OAuth 콜백·로그아웃
  - [ ] Trip 프로젝트 연결 및 Google/Kakao 콘솔 등록 후 실제 로그인 통합 검증
- [x] 4단계 — 여행 CRUD와 날짜별 타임라인 (실제 DB 연결 후 동작 확인 필요)
- [x] 5단계 — Kakao 장소 검색·지도 (실제 로그인 후 동작 확인 필요)
- [ ] 6단계 — 타임라인 ↔ 지도 양방향 하이라이트
- [ ] 7단계 — 항공 provider adapter
- [ ] 8단계 — 읽기 전용 공유 링크, 동행자 초대
- [ ] 9단계 — E2E 확충과 Vercel Preview 배포

## 환경변수

- 실제 값은 `.env.local`에 두며 Git에 커밋하지 않습니다.
- 필요한 키 목록은 `.env.example`에 있습니다.
- 참고 앱에서 가져온 Supabase 설정은 초기 개발용입니다. 운영 전 Trip 전용 Supabase 프로젝트로 교체해야 합니다.
- Kakao 무료 쿼터는 개발자 계정에서 최초 활성화한 앱 1개에만 제공됩니다. 앱 생성 전략을 먼저 정하세요.
- 항공편 공급자는 아직 확정되지 않았습니다. 후보와 검증 항목은 [docs/adr/0001-flight-data-provider.md](docs/adr/0001-flight-data-provider.md)에 있습니다. 공공데이터포털은 활용 신청 승인에 1~2일 걸립니다.
- 네이버 검색 키는 v1.1의 후기·사진 보강용이며 MVP에는 필요하지 않습니다.
