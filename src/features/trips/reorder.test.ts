import { describe, expect, it } from "vitest";

import { planMoveDown, planMoveToDay, planMoveUp } from "@/features/trips/reorder";
import type { ItineraryItem } from "@/features/trips/types";
import { zonedDateKey } from "@/lib/datetime";

const TZ = "Asia/Tokyo";

function item(id: string, startAt: string, sortOrder: number): ItineraryItem {
  return {
    id,
    tripId: "trip",
    type: "activity",
    status: "confirmed",
    title: id,
    note: null,
    locationText: null,
    startAt,
    endAt: null,
    allDay: false,
    sortOrder,
    updatedAt: startAt,
    coordinate: null,
  };
}

/** listItems 와 같은 정렬: (start_at, sort_order) */
function timeline(...list: ItineraryItem[]): ItineraryItem[] {
  return [...list].sort(
    (a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.sortOrder - b.sortOrder,
  );
}

// 2026-02-14 도쿄(UTC+9) 기준. 01:00Z = 10:00 현지.
const a = item("a", "2026-02-14T01:00:00+00:00", 1000);
const b = item("b", "2026-02-14T02:00:00+00:00", 2000);
const c = item("c", "2026-02-14T03:00:00+00:00", 3000);

describe("planMoveUp", () => {
  it("바로 위 항목의 시각을 넘겨받고 그 앞에 선다", () => {
    // sort_order 만 바꾸면 start_at 이 앞서는 b 를 절대 넘어설 수 없다.
    const plan = planMoveUp(timeline(a, b, c), "c", TZ);
    expect(plan).toEqual({ startAt: b.startAt, afterItemId: a.id });
  });

  it("두 번째 항목은 기준 없이 맨 앞으로 간다", () => {
    const plan = planMoveUp(timeline(a, b, c), "b", TZ);
    expect(plan).toEqual({ startAt: a.startAt, afterItemId: null });
  });

  it("맨 위 항목은 움직이지 않는다", () => {
    expect(planMoveUp(timeline(a, b, c), "a", TZ)).toBeNull();
  });

  it("다른 날짜 항목은 이웃으로 보지 않는다", () => {
    // 전날 마지막 항목이 있어도 그 날의 첫 항목은 여전히 맨 위다.
    const yesterday = item("z", "2026-02-13T05:00:00+00:00", 1000);
    expect(planMoveUp(timeline(yesterday, a, b), "a", TZ)).toBeNull();
  });

  it("없는 항목이면 계획하지 않는다", () => {
    expect(planMoveUp(timeline(a), "없음", TZ)).toBeNull();
  });
});

describe("planMoveDown", () => {
  it("바로 아래 항목의 시각을 넘겨받고 그 뒤에 선다", () => {
    const plan = planMoveDown(timeline(a, b, c), "a", TZ);
    expect(plan).toEqual({ startAt: b.startAt, afterItemId: b.id });
  });

  it("맨 아래 항목은 움직이지 않는다", () => {
    expect(planMoveDown(timeline(a, b, c), "c", TZ)).toBeNull();
  });

  it("같은 시각 항목끼리는 sort_order 만으로 자리를 바꾼다", () => {
    const first = item("first", "2026-02-14T01:00:00+00:00", 1000);
    const second = item("second", "2026-02-14T01:00:00+00:00", 2000);
    const plan = planMoveDown(timeline(first, second), "first", TZ);
    expect(plan).toEqual({ startAt: second.startAt, afterItemId: second.id });
  });
});

describe("planMoveToDay", () => {
  it("벽시계 시각을 유지한 채 날짜만 바꾼다", () => {
    // a 는 도쿄 기준 10:00. 하루 뒤에도 10:00 이어야 한다.
    const plan = planMoveToDay(timeline(a, b), "a", "2026-02-16", TZ);
    expect(plan?.startAt).toBe("2026-02-16T01:00:00.000Z");
    expect(plan?.afterItemId).toBeNull();
  });

  it("옮긴 날짜에서 시각에 맞는 자리에 끼운다", () => {
    // 2/15 에 09:00(00:00Z)·12:00(03:00Z) 이 있고 10:00 을 넣으면 그 사이다.
    const morning = item("morning", "2026-02-15T00:00:00+00:00", 1000);
    const noon = item("noon", "2026-02-15T03:00:00+00:00", 2000);
    const plan = planMoveToDay(timeline(a, morning, noon), "a", "2026-02-15", TZ);
    expect(plan).toEqual({ startAt: "2026-02-15T01:00:00.000Z", afterItemId: "morning" });
  });

  it("옮긴 날짜의 모든 항목보다 이르면 맨 앞이다", () => {
    const late = item("late", "2026-02-15T09:00:00+00:00", 1000);
    const plan = planMoveToDay(timeline(a, late), "a", "2026-02-15", TZ);
    expect(plan?.afterItemId).toBeNull();
  });

  it("같은 날짜로 옮기면 아무것도 하지 않는다", () => {
    expect(planMoveToDay(timeline(a, b), "a", "2026-02-14", TZ)).toBeNull();
  });

  it("시차가 있는 시간대에서도 현지 시각이 유지된다", () => {
    // 뉴욕(UTC-5) 여행. 2/14 20:00 현지 = 2/15 01:00Z 로 UTC 날짜가 하루 앞선다.
    // 현지 2/16 20:00 로 옮기면 UTC 로는 2/17 01:00Z — UTC 날짜만 보고 옮기면
    // 하루가 밀린다.
    const ny = "America/New_York";
    const evening = item("evening", "2026-02-15T01:00:00+00:00", 1000);
    const plan = planMoveToDay(timeline(evening), "evening", "2026-02-16", ny);
    expect(plan?.startAt).toBe("2026-02-17T01:00:00.000Z");
    expect(zonedDateKey(plan!.startAt, ny)).toBe("2026-02-16");
  });
});
