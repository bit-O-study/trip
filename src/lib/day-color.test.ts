import { describe, expect, it } from "vitest";

import {
  DAY_COLORS,
  DAY_COLOR_COUNT,
  dayColor,
  dayColorVar,
} from "@/lib/day-color";

describe("dayColor", () => {
  it("0-based index를 순서대로 매핑한다", () => {
    expect(dayColor(0)).toBe(DAY_COLORS[0]);
    expect(dayColor(3)).toBe(DAY_COLORS[3]);
    expect(dayColor(DAY_COLOR_COUNT - 1)).toBe(DAY_COLORS[DAY_COLOR_COUNT - 1]);
  });

  it("팔레트 길이를 넘으면 순환한다", () => {
    expect(dayColor(DAY_COLOR_COUNT)).toBe(DAY_COLORS[0]);
    expect(dayColor(DAY_COLOR_COUNT + 2)).toBe(DAY_COLORS[2]);
  });

  it("음수 index도 팔레트 안으로 되돌린다", () => {
    expect(dayColor(-1)).toBe(DAY_COLORS[DAY_COLOR_COUNT - 1]);
    expect(dayColor(-DAY_COLOR_COUNT)).toBe(DAY_COLORS[0]);
  });

  it("유효하지 않은 값은 첫 색으로 대체한다", () => {
    expect(dayColor(Number.NaN)).toBe(DAY_COLORS[0]);
    expect(dayColor(Number.POSITIVE_INFINITY)).toBe(DAY_COLORS[0]);
  });

  it("모든 색이 서로 달라야 마커를 구분할 수 있다", () => {
    expect(new Set(DAY_COLORS).size).toBe(DAY_COLOR_COUNT);
  });
});

describe("dayColorVar", () => {
  it("CSS 변수 이름은 1-based다", () => {
    expect(dayColorVar(0)).toBe("var(--day-1)");
    expect(dayColorVar(7)).toBe("var(--day-8)");
  });

  it("dayColor와 같은 순환 규칙을 따른다", () => {
    expect(dayColorVar(DAY_COLOR_COUNT)).toBe("var(--day-1)");
    expect(dayColorVar(-1)).toBe(`var(--day-${DAY_COLOR_COUNT})`);
  });
});
