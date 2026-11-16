import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";

import { LoadingTrain } from "./loading-train";

it("로딩 상태는 읽을 수 있고 장식은 스크린 리더에서 숨긴다", () => {
  const html = renderToStaticMarkup(<LoadingTrain label="여행 가방 싸는 중" />);
  expect(html).toContain('role="status"');
  expect(html).toContain("여행 가방 싸는 중");
  expect(html).toContain('aria-hidden="true"');
});
