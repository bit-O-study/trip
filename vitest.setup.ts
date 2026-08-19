import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/*
 * globals: false 로 실행하므로 Testing Library의 자동 cleanup이 등록되지 않는다.
 * 직접 걸어주지 않으면 이전 테스트의 DOM이 남아 쿼리가 중복 매칭된다.
 */
afterEach(() => {
  cleanup();
});
