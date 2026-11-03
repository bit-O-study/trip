import { describe, expect, it } from "vitest";

import { hintForDestination } from "./destination-hints";

describe("hintForDestination", () => {
  it("도시 이름으로 시간대와 통화를 제안한다", () => {
    expect(hintForDestination("도쿄")).toMatchObject({ timezone: "Asia/Tokyo", currency: "JPY" });
    expect(hintForDestination("타이베이 야시장")).toMatchObject({ timezone: "Asia/Taipei", currency: "TWD" });
    expect(hintForDestination("제주")).toMatchObject({ timezone: "Asia/Seoul", currency: "KRW" });
  });

  it("모르는 곳은 제안하지 않는다", () => {
    expect(hintForDestination("울란바토르")).toBeNull();
    expect(hintForDestination("   ")).toBeNull();
  });
});
