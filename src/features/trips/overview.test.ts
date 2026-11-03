import { describe, expect, it } from "vitest";
import { continuingStays, indexContinuingStays, departureLabel, travelPhase } from "./overview";
import type { ItineraryItem, TripSummary } from "./types";

const trip: TripSummary = {
  id: "trip", title: "서울", destinationName: "서울", startDate: "2026-11-03", endDate: "2026-11-05",
  timezone: "Asia/Seoul", status: "planning", coverImageUrl: null, deletedAt: null,
};
const stay: ItineraryItem = {
  id: "stay", tripId: "trip", title: "호텔", type: "lodging", status: "confirmed",
  startAt: "2026-11-02T16:00:00Z", endAt: "2026-11-05T01:00:00Z", allDay: false,
  note: null, locationText: null, coordinate: null, sortOrder: 0, updatedAt: "2026-11-01T00:00:00Z",
};

describe("여행 현지 날짜 요약", () => {
  it("UTC 날짜 대신 목적지의 자정을 기준으로 출발과 종료를 구분한다", () => {
    expect(travelPhase(trip, "2026-11-02T14:59:00Z")).toBe("upcoming");
    expect(departureLabel(trip, "2026-11-02T14:59:00Z")).toBe("D-1");
    expect(travelPhase(trip, "2026-11-02T15:00:00Z")).toBe("ongoing");
    expect(travelPhase(trip, "2026-11-05T14:59:00Z")).toBe("ongoing");
    expect(travelPhase(trip, "2026-11-05T15:00:00Z")).toBe("past");
  });
  it("서머타임 전환을 지나도 D-day는 달력 날짜로 센다", () => {
    expect(departureLabel({ ...trip, timezone: "America/New_York" }, "2026-11-01T04:00:00Z")).toBe("D-2");
  });
});

describe("연박 숙소", () => {
  it("날짜 색인은 기간 밖 체크인과 체크아웃 당일을 보존한다", () => {
    const dates = ["2026-11-04", "2026-11-05", "2026-11-06"];
    const index = indexContinuingStays([stay], dates, trip.timezone);
    for (const date of dates) expect(index.get(date) ?? []).toEqual(continuingStays([stay], date, trip.timezone));
  });
  it("체크인 날 중복 없이 숙박일과 체크아웃 날에만 노출한다", () => {
    expect(continuingStays([stay], "2026-11-03", trip.timezone)).toEqual([]);
    expect(continuingStays([stay], "2026-11-04", trip.timezone)).toEqual([stay]);
    expect(continuingStays([stay], "2026-11-05", trip.timezone)).toEqual([stay]);
    expect(continuingStays([stay], "2026-11-06", trip.timezone)).toEqual([]);
  });
  it("취소·투표 후보·체크아웃 없는 항목을 제외한다", () => {
    expect(continuingStays([{ ...stay, status: "cancelled" }, { ...stay, status: "candidate" }, { ...stay, endAt: null }], "2026-11-04", trip.timezone)).toEqual([]);
  });
});
