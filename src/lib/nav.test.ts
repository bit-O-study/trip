import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

describe("isNavItemActive", () => {
  it("루트는 정확히 일치할 때만 활성이다", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/trips/new", "/")).toBe(false);
  });

  it("하위 경로도 활성으로 본다", () => {
    expect(isNavItemActive("/trips/new", "/trips/new")).toBe(true);
    expect(isNavItemActive("/trips/new/step-2", "/trips/new")).toBe(true);
  });

  it("접두사만 같은 다른 경로는 활성이 아니다", () => {
    expect(isNavItemActive("/trips/new-york", "/trips/new")).toBe(false);
  });

  it("어떤 경로에서도 활성 항목이 둘 이상 나오지 않는다", () => {
    for (const pathname of ["/", "/trips/new", "/trips/new/step-2", "/unknown"]) {
      const activeCount = NAV_ITEMS.filter((item) =>
        isNavItemActive(pathname, item.href),
      ).length;
      expect(activeCount).toBeLessThanOrEqual(1);
    }
  });
});
