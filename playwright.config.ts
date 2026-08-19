import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

/*
 * 기본은 프로덕션 빌드를 대상으로 돌린다.
 *
 * dev 서버는 라우트를 첫 요청 때 컴파일한다. 모바일·데스크톱 두 프로젝트가
 * 병렬로 때리면 앱이 커질수록 컴파일 대기가 쌓여 타임아웃 경계에서 산발적으로
 * 실패한다(실제로 그렇게 됐다). 빌드는 한 번 30초쯤 걸리지만 이후 요청은
 * 밀리초 단위라 전체 실행이 더 빠르고 무엇보다 결과가 재현된다.
 *
 * 화면을 고치며 빠르게 확인할 때는 PLAYWRIGHT_DEV=1 로 dev 서버를 쓴다.
 */
const useDevServer = process.env.PLAYWRIGHT_DEV === "1";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  /*
   * 워커 수를 제한한다.
   *
   * 기본값(코어 수의 절반)으로 두면 두 프로젝트가 한 대의 Next 서버에 동시에
   * 몰린다. 모든 SSR 요청이 Supabase 호출을 기다리므로 동시 요청이 쌓이면
   * 개별 테스트가 타임아웃 경계까지 밀린다. 실제로 8워커에서 대부분 실패했고
   * 2워커에서 전부 통과했다.
   */
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  /*
   * 모바일 우선 앱이므로 모바일 뷰포트를 먼저 둔다.
   * 두 프로젝트를 모두 돌려야 하단 탭바(모바일)와 상단 인라인 링크(데스크톱)의
   * 반응형 전환이 실제로 검증된다.
   */
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: useDevServer ? "npm run dev" : "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // 빌드까지 포함하므로 넉넉히 잡는다.
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
