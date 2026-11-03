import { zonedDateKey } from "@/lib/datetime";
import type { ItineraryItem, TripSummary } from "./types";

export type TravelPhase = "upcoming" | "ongoing" | "past";
export const PHASE_LABELS: Record<TravelPhase, string> = {
  upcoming: "예정된 여행", ongoing: "여행 중", past: "지난 여행",
};

/** 날짜에 따른 표시 상태이며 DB의 계획 상태를 변경하지 않는다. */
export function travelPhase(trip: TripSummary, now: string): TravelPhase {
  const today = zonedDateKey(now, trip.timezone);
  return today < trip.startDate ? "upcoming" : today > trip.endDate ? "past" : "ongoing";
}

export function departureLabel(trip: TripSummary, now: string): string {
  const phase = travelPhase(trip, now);
  if (phase !== "upcoming") return PHASE_LABELS[phase];
  const days = Math.round((Date.parse(trip.startDate) - Date.parse(zonedDateKey(now, trip.timezone))) / 86400000);
  return `D-${days}`;
}

/** 체크인 이후 날짜에도 숙소를 표시하고 체크아웃 당일을 구분한다. */
export function continuingStays(items: ItineraryItem[], date: string, timezone: string) {
  return items.filter((item) => item.type === "lodging" && item.status !== "cancelled" &&
    item.status !== "candidate" && item.endAt &&
    zonedDateKey(item.startAt, timezone) < date && zonedDateKey(item.endAt, timezone) >= date);
}

/** 날짜 변환은 숙박당 한 번만 수행하고, 화면에 필요한 날짜만 색인한다. */
export function indexContinuingStays(items: ItineraryItem[], dates: readonly string[], timezone: string) {
  const byDate = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    if (item.type !== "lodging" || !item.endAt || item.status === "cancelled" || item.status === "candidate") continue;
    const start = zonedDateKey(item.startAt, timezone);
    const end = zonedDateKey(item.endAt, timezone);
    for (const date of dates) {
      if (date <= start || date > end) continue;
      const bucket = byDate.get(date) ?? [];
      bucket.push(item);
      byDate.set(date, bucket);
    }
  }
  return byDate;
}
