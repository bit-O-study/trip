import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";

import { LoadingTrain } from "./loading-train";

it("로딩 기차는 상태 영역으로 렌더링되고 그림은 스크린 리더에서 숨긴다", () => {
  const html = renderToStaticMarkup(<LoadingTrain label="여행 가방 싸는 중" />);
  expect(html).toContain('role="status"');
  expect(html).toContain("여행 가방 싸는 중");
  expect(html).toContain('aria-hidden="true"');
});
