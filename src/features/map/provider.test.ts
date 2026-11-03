import { describe, expect, it } from "vitest";

import { pickProvider } from "./provider";

describe("pickProvider", () => {
  it("실패가 없으면 기본 지도를 쓴다", () => {
    expect(pickProvider("kakao", new Set())).toBe("kakao");
    expect(pickProvider("google", new Set())).toBe("google");
  });

  it("기본 지도가 실패하면 OpenStreetMap 으로 넘어간다", () => {
    expect(pickProvider("kakao", new Set(["kakao"]))).toBe("osm");
    expect(pickProvider("google", new Set(["google"]))).toBe("osm");
  });

  it("다른 공급자의 실패는 영향을 주지 않는다", () => {
    expect(pickProvider("google", new Set(["kakao"]))).toBe("google");
  });
});
