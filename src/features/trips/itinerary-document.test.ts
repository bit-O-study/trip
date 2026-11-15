import { describe, expect, it } from "vitest";
import { exportTime, itineraryDocument, itineraryFilename } from "./itinerary-document";
import type { ItineraryItem } from "./types";

const trip = { title: "대만 여행", startDate: "2026-11-19", endDate: "2026-11-21", timezone: "Asia/Taipei", destinationName: "가오슝" };
const item = (overrides: Partial<ItineraryItem>): ItineraryItem => ({ id: "one", tripId: "trip", type: "activity", status: "confirmed", title: "장소", note: "예약 메모", locationText: "주소", startAt: "2026-11-19T02:00:00Z", endAt: null, allDay: false, sortOrder: 1000, updatedAt: "", coordinate: null, ...overrides });

describe("공유용 일정표", () => {
  it("여행 시간대로 날짜를 나누고 선택한 Day만 저장한다", () => {
    const result = itineraryDocument(trip, [item({ startAt: "2026-11-19T17:00:00Z" }), item({ id: "two", title: "다른 날" })], "2026-11-20", false);
    expect(result.scope).toBe("Day 2"); expect(result.days).toHaveLength(1);
    expect(result.days[0].rows.map((row) => row.title)).toEqual(["장소"]);
    expect(result.days[0].rows[0].time).toBe("01:00"); expect(result.days[0].rows[0].note).toBeNull();
  });
  it("이어지는 숙박과 빈 날, 기간 밖 일정을 빠뜨리지 않는다", () => {
    const items = [item({ type: "lodging", endAt: "2026-11-21T03:00:00Z" }), item({ id: "outside", startAt: "2026-11-23T03:00:00Z" })];
    const result = itineraryDocument(trip, items, null, true);
    expect(result.days).toHaveLength(4);
    expect(result.days[1].rows[0].title).toContain("숙박 중");
    expect(result.days[2].rows[0].title).toContain("체크아웃 예정");
    expect(result.days[3].label).toContain("여행 기간 밖");
    expect(result.days[0].rows[0].note).toBe("예약 메모");
    expect(itineraryDocument(trip, [], null, false).days).toHaveLength(3);
  });
  it("항공편은 공항별 날짜와 시각, 숙박은 체크아웃 날짜를 보존한다", () => {
    expect(exportTime(item({ type: "flight", startAt: "2026-11-19T02:00:00Z", endAt: "2026-11-19T05:15:00Z", flight: { departureAirport: "GMP", arrivalAirport: "KHH", departureTimezone: "Asia/Seoul", arrivalTimezone: "Asia/Taipei" } }), trip.timezone)).toBe("2026-11-19 11:00 GMP → 2026-11-19 13:15 KHH (각 공항 현지 시각)");
    expect(exportTime(item({ type: "lodging", endAt: "2026-11-21T03:00:00Z" }), trip.timezone)).toContain("체크아웃 2026-11-21 11:00");
  });
  it("종일·취소 상태와 파일명을 보존한다", () => {
    const result = itineraryDocument(trip, [item({ status: "cancelled", allDay: true })], null, false);
    expect(result.days[0].rows[0].title).toBe("[취소] 장소"); expect(result.days[0].rows[0].time).toBe("종일");
    expect(itineraryFilename("여행/대만:5일", "Day 1", "pdf")).toBe("여행_대만_5일_Day 1.pdf");
  });
});
