<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Trip Planner

여행 일정관리 앱. 항공편·숙소·맛집을 한 타임라인에서 관리하고 지도와 양방향으로 연동한다.

## 설계 문서가 우선한다

- **[docs/architecture.md](docs/architecture.md)** — 제품 범위, 데이터 모델, 보안·RLS, 구현 순서. 코드와 충돌하면 이 문서가 기준이다.
- **[docs/adr/](docs/adr/)** — 외부 공급자 선정처럼 시점에 따라 달라지는 결정. 가격·쿼터 수치는 architecture.md가 아니라 여기에 확인일과 함께 적는다.

## 개발 포트는 3100이다

`next dev --port 3100` 으로 고정돼 있다. 이 머신의 **포트 3000은 다른 프로젝트(참고 앱)가 점유**하고 있고, Next는 포트가 막히면 조용히 다음 번호로 옮겨간다. 포트가 그때그때 달라지면 OAuth redirect URL 등록이 어긋나므로 고정한다. 포트를 바꾸려면 `package.json`, `playwright.config.ts`, `.env.example`, `docs/architecture.md`의 OAuth 절을 함께 고쳐야 한다.

## 명령

```bash
npm run dev         # 개발 서버 (http://localhost:3100)
npm run check       # lint + typecheck + 단위 테스트
npm test            # 단위 테스트 (Vitest, src/**/*.test.ts?(x))
npm run test:e2e    # E2E (Playwright, e2e/, mobile + desktop 프로젝트)
npm run build       # 프로덕션 빌드 (Turbopack)
```

## 규칙

- **좌표는 WGS84 하나만 쓴다.** 외부 API 응답은 수집 즉시 정규화한다.
- **시각은 `timestamptz`(UTC)로 저장하고 표시할 때만 변환한다.** 공항별 시간대는 행에 저장한다.
- **외부 API 키는 서버 전용이다.** 브라우저에 나가는 값은 `NEXT_PUBLIC_` 접두사로만, 그리고 노출돼도 안전한 것만.
- **Day 색상은 `src/lib/day-color.ts` 한 곳에서 정의한다.** 타임라인과 지도 마커가 같은 색을 공유해야 한다.
- 드래그로만 되는 조작을 만들지 않는다. 키보드 대체 경로를 함께 제공한다.
- **미들웨어 파일은 `src/proxy.ts` 다.** Next.js 16 에서 `middleware` 규약이 `proxy` 로 바뀌었고 런타임은 nodejs 고정이다. `middleware.ts` 를 만들지 않는다.
- **접근 제어는 `src/proxy.ts` 와 RLS 가 담당한다.** `getCurrentUser()` 는 화면 표시용이며 권한 판정에 쓰지 않는다. 공개 경로는 `src/lib/auth/paths.ts` 의 화이트리스트로만 늘린다 — 기본값은 항상 보호다.
- **스키마는 `supabase/migrations/` 가 유일한 출처다.** 대시보드 SQL 에디터에서 직접 바꾸지 않는다. RLS 정책을 추가하면 `src/test/db/rls.test.ts` 에 **거부되는 경우**까지 테스트를 함께 쓴다. 자세한 내용은 [supabase/README.md](supabase/README.md).
