import { expect, it } from "vitest";
import { scheduleOverlapMap, type Stop } from "./travel";

function stop(id: string, start: string, end: string | null): Stop {
  return { id, title: id, coordinate: null, locationText: null, type: "activity", status: "confirmed", allDay: false, startAt: start, endAt: end };
}
const tour = stop("긴 투어", "2026-11-21T01:00:00Z", "2026-11-21T05:00:00Z");
const first = stop("첫 식사", "2026-11-21T02:00:00Z", "2026-11-21T03:00:00Z");
const second = stop("다음 관광", "2026-11-21T04:00:00Z", "2026-11-21T06:00:00Z");

it("정렬 순서와 관계없이 긴 일정 안에 포함된 모든 일정의 겹침을 양쪽에 표시한다", () => {
  const items = [second, first, tour];
  const result = scheduleOverlapMap(items);
  expect(result.get(tour.id)).toEqual([{ id: first.id, title: first.title, minutes: 60 }, { id: second.id, title: second.title, minutes: 60 }]);
  expect(result.get(second.id)).toEqual([{ id: tour.id, title: tour.title, minutes: 60 }]);
  expect(result.get(first.id)).toEqual([{ id: tour.id, title: tour.title, minutes: 60 }]);
  expect(items).toEqual([second, first, tour]);
});

it("종일·숙박·취소·후보와 시각이 불완전한 일정은 경고에서 제외한다", () => {
  const excluded: Stop[] = [
    { ...first, id: "all-day", allDay: true }, { ...first, id: "hotel", type: "lodging" },
    { ...first, id: "cancelled", status: "cancelled" }, { ...first, id: "candidate", status: "candidate" },
    { ...first, id: "unknown-end", endAt: null }, { ...first, id: "invalid", startAt: "invalid" },
    { ...first, id: "reversed", endAt: "2026-11-21T01:00:00Z" },
  ];
  expect(scheduleOverlapMap([tour, ...excluded]).size).toBe(0);
});

it("날짜와 UTC 오프셋이 달라도 실제 시간이 겹치면 경고하고 경계만 닿으면 제외한다", () => {
  const overnight = stop("야간 이동", "2026-11-21T23:00:00+08:00", "2026-11-22T01:00:00+08:00");
  const visit = stop("다음 날 관광", "2026-11-22T00:30:00+08:00", "2026-11-21T18:00:00Z");
  const boundary = stop("다음 일정", "2026-11-21T18:00:00Z", "2026-11-21T19:00:00Z");
  const result = scheduleOverlapMap([overnight, visit, boundary]);
  expect(result.get(visit.id)).toEqual([{ id: overnight.id, title: overnight.title, minutes: 30 }]);
  expect(result.has(boundary.id)).toBe(false);
  expect(scheduleOverlapMap([]).size).toBe(0);
});
