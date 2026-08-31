# 배포 전 필수 확인

이 문서의 검증을 **배포보다 먼저** 실행한다. 특히 지도, 투표 삭제, 일정 삭제가 실패하면 배포하지 않는다.

## 1. 자동 테스트 (최우선)

```powershell
npm run check
npm run test:e2e
npm run build
```

실계정 핵심 회귀 테스트는 비밀번호를 파일에 저장하지 않고 실행 환경으로만 전달한다.

```powershell
$env:E2E_ACCOUNT_EMAIL="test@example.com"
$env:E2E_ACCOUNT_PASSWORD="세션에서만 입력"
$env:PLAYWRIGHT_BASE_URL="https://배포-확인-주소"
npx playwright test e2e/critical-regressions.spec.ts --project=mobile --project=desktop
```

## 2. 반드시 통과해야 하는 시나리오

- 로그인 후 여행 상세의 Google 지도가 오류 안내 없이 표시된다.
- 일정 하나를 새로 만든 뒤 삭제하면 타임라인과 지도에서 모두 사라진다.
- 투표 하나를 새로 만든 뒤 삭제하면 투표와 연결 후보가 사라진다.
- 권한 없는 viewer는 일정·다른 사람이 만든 투표를 삭제할 수 없다.
- 여행 soft delete 후 목록에서 사라지고 휴지통에서 복구된다.

## 3. DB와 배포 환경

- `npm run db:verify -- --env-file .env.local`로 마이그레이션 적용 상태를 확인한다.
- `20260821000001_poll_creator_delete_and_move_duration.sql`이 운영 DB에 적용됐는지 확인한다.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`가 배포 환경에 있고 Maps JavaScript API, 결제, 웹사이트 제한이 정상인지 확인한다.
- Google Cloud 허용 도메인에 실제 운영 도메인과 프리뷰 검증 도메인을 등록한다.

## 4. 배포 직후 확인

- 모바일과 데스크톱에서 지도를 각각 연다.
- 테스트용 일정과 투표를 생성·삭제한다.
- Vercel 오류 로그에서 Server Action, Supabase RPC, Google Maps 오류가 없는지 확인한다.
- 이상이 있으면 새 기능 확인보다 먼저 배포를 중단하거나 직전 정상 배포로 되돌린다.
