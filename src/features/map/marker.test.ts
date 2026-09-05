import { describe, expect, it } from "vitest";

import { groupByDay } from "@/features/map/marker";
import type { MapPoint } from "@/features/map/types";

function point(overrides: Partial<MapPoint> & Pick<MapPoint, "id" | "dayIndex" | "order">): MapPoint {
  return { title: "장소", latitude: 33.5, longitude: 126.5, ...overrides };
}

describe("groupByDay", () => {
  it("Day 별로 나누고 방문 순번대로 정렬한다", () => {
    const grouped = groupByDay([
      point({ id: "b", dayIndex: 0, order: 2 }),
      point({ id: "a", dayIndex: 0, order: 1 }),
      point({ id: "c", dayIndex: 1, order: 1 }),
    ]);

    expect(grouped.get(0)?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(grouped.get(1)?.map((p) => p.id)).toEqual(["c"]);
  });

  /*
   * 후보는 그중 하나만 가게 될 자리다. 이어 두면 전부 도는 동선처럼 읽힌다.
   */
  it("투표 후보는 연결선에서 뺀다", () => {
    const grouped = groupByDay([
      point({ id: "item", dayIndex: 0, order: 1 }),
      point({ id: "cand-1", dayIndex: 3, order: 1, kind: "candidate" }),
      point({ id: "cand-2", dayIndex: 3, order: 2, kind: "candidate" }),
    ]);

    expect([...grouped.keys()]).toEqual([0]);
  });
});
