import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./e2e",
  // webServer 가 뜬 뒤 주요 라우트를 미리 컴파일시킨다.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  /*
   * dev 서버가 차가운 상태에서는 첫 라우트 컴파일에 시간이 걸린다.
   * 기본 30초로는 여러 프로젝트가 동시에 첫 요청을 보낼 때 부족하다.
   */
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
