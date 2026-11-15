import { tripDays, zonedDateKey, zonedTimeLabel } from "@/lib/datetime";
import { continuingStays } from "./overview";
import { ITEM_TYPE_LABELS, type ItineraryItem, type TripSummary } from "./types";

export type DocumentRow = { title: string; time: string; detail: string; note: string | null };
export type DocumentDay = { label: string; colorIndex: number; rows: DocumentRow[] };
export type ItineraryDocument = { title: string; subtitle: string; scope: string; days: DocumentDay[] };

export function exportTime(item: ItineraryItem, timezone: string): string {
  const full = (iso: string, zone = timezone) => `${zonedDateKey(iso, zone)} ${zonedTimeLabel(iso, zone)}`;
  if (item.type === "flight" && item.flight) {
    const flight = item.flight;
    return `${full(item.startAt, flight.departureTimezone)} ${flight.departureAirport ?? ""}${item.endAt ? ` → ${full(item.endAt, flight.arrivalTimezone)} ${flight.arrivalAirport ?? ""}` : ""} (각 공항 현지 시각)`;
  }
  if (item.type === "lodging") return `체크인 ${full(item.startAt)} · 체크아웃 ${item.endAt ? full(item.endAt) : "미입력"}`;
  if (item.allDay) return "종일";
  return `${zonedTimeLabel(item.startAt, timezone)}${item.endAt ? ` ~ ${zonedDateKey(item.endAt, timezone) === zonedDateKey(item.startAt, timezone) ? zonedTimeLabel(item.endAt, timezone) : full(item.endAt)}` : ""}`;
}

export function itineraryDocument(trip: Pick<TripSummary, "title" | "startDate" | "endDate" | "timezone" | "destinationName">, items: ItineraryItem[], date: string | null, includeNotes: boolean): ItineraryDocument {
  const days = tripDays(trip.startDate, trip.endDate);
  const sorted = [...items].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const row = (item: ItineraryItem): DocumentRow => ({
    title: `${item.status === "cancelled" ? "[취소] " : item.status === "tentative" ? "[미확정] " : item.status === "candidate" ? "[후보] " : ""}${item.title}`,
    time: exportTime(item, trip.timezone),
    detail: [ITEM_TYPE_LABELS[item.type], item.locationText].filter(Boolean).join(" · "),
    note: includeNotes ? item.note : null,
  });
  const sections: DocumentDay[] = days.filter((day) => date === null || date === day.date).map((day) => ({
    label: `Day ${day.index + 1} · ${day.date} (${day.weekday})`, colorIndex: day.index,
    rows: [
      ...continuingStays(sorted, day.date, trip.timezone).map((item) => ({ ...row(item), title: `${zonedDateKey(item.endAt!, trip.timezone) === day.date ? "체크아웃 예정" : "숙박 중"} · ${item.title}`, note: null })),
      ...sorted.filter((item) => zonedDateKey(item.startAt, trip.timezone) === day.date).map(row),
    ],
  }));
  if (date === null) {
    const knownDates = new Set(days.map((day) => day.date));
    const outside = sorted.filter((item) => !knownDates.has(zonedDateKey(item.startAt, trip.timezone)));
    for (const outsideDate of new Set(outside.map((item) => zonedDateKey(item.startAt, trip.timezone)))) {
      sections.push({ label: `여행 기간 밖 · ${outsideDate}`, colorIndex: 0, rows: outside.filter((item) => zonedDateKey(item.startAt, trip.timezone) === outsideDate).map(row) });
    }
  }
  const selected = days.find((day) => day.date === date);
  return { title: trip.title, subtitle: [trip.destinationName, `${trip.startDate} ~ ${trip.endDate}`, trip.timezone].filter(Boolean).join(" · "), scope: selected ? `Day ${selected.index + 1}` : "전체 일정", days: sections };
}

export function itineraryFilename(title: string, scope: string, extension: "pdf" | "jpg") {
  const name = `${title}_${scope}`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 100);
  return `${name || "여행일정"}.${extension}`;
}
