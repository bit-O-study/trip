import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    /* e2e/ 는 Playwright가 담당한다. 여기서 잡으면 두 러너가 같은 파일을 실행한다. */
    include: ["src/**/*.test.{ts,tsx}"],
    /*
     * 기본 5초는 이 저장소에서 너무 짧다.
     *
     * Server Action 테스트는 첫 단언 안에서 `await import()` 로 모듈을 처음
     * 불러온다. 파일이 늘어 워커가 붐비면 그 첫 변환 하나가 5초를 넘겨,
     * 로직과 무관하게 **각 파일의 첫 테스트만** 타임아웃으로 떨어졌다.
     */
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
