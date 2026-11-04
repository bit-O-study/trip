import { describe, expect, it } from "vitest";

import { defaultCenterForTimezone } from "./default-center";

describe("defaultCenterForTimezone", () => {
  it("대만 시간대는 타이베이 근처", () => {
    const center = defaultCenterForTimezone("Asia/Taipei");
    expect(center?.latitude).toBeCloseTo(25.05, 1);
    expect(center?.longitude).toBeCloseTo(121.53, 1);
  });

  it("모르는 시간대·없는 값은 null(지도 기본값에 맡긴다)", () => {
    expect(defaultCenterForTimezone("Asia/Seoul")).toBeNull();
    expect(defaultCenterForTimezone("Nowhere/Land")).toBeNull();
    expect(defaultCenterForTimezone(null)).toBeNull();
  });
});
