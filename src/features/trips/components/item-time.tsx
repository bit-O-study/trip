import { zonedDateKey, zonedTimeLabel } from "@/lib/datetime";
import type { ItineraryItem } from "@/features/trips/types";

type TimedItem = {
  type: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  flight?: ItineraryItem["flight"];
};

/**
 * 항공편은 여행 시간대가 아니라 **각 공항의 현지 시각**으로 보여 준다.
 * 탑승권·공항 전광판과 같은 숫자여야 하고, 시차 노선에서 여행 시간대로 바꾸면
 * 출발·도착 시각이 둘 다 실제와 달라 보인다.
 */
function FlightTime({ item, timezone }: { item: TimedItem & { flight: NonNullable<TimedItem["flight"]> }; timezone: string }) {
  const { flight } = item;
  // 일정은 여행 시간대의 날짜 아래 놓인다. 공항 현지 날짜가 그와 다르면 날짜를 붙인다.
  const dayKey = zonedDateKey(item.startAt, timezone);
  const at = (iso: string, zone: string) => {
    const date = zonedDateKey(iso, zone);
    return `${date === dayKey ? "" : `${date.slice(5).replace("-", "/")} `}${zonedTimeLabel(iso, zone)}`;
  };
  const departure = `${at(item.startAt, flight.departureTimezone)}${flight.departureAirport ? ` ${flight.departureAirport}` : ""}`;
  const arrival = item.endAt
    ? `${at(item.endAt, flight.arrivalTimezone)}${flight.arrivalAirport ? ` ${flight.arrivalAirport}` : ""}`
    : null;
  return (
    <span className="font-mono text-sm tabular-nums text-muted-foreground" title="각 공항 현지 시각">
      {departure}
      {arrival ? ` → ${arrival}` : ""}
      <span className="sr-only"> (각 공항 현지 시각)</span>
    </span>
  );
}

export function ItemTime({ item, timezone }: { item: TimedItem; timezone: string }) {
  const label = (at: string) => `${zonedDateKey(at, timezone)} ${zonedTimeLabel(at, timezone)}`;
  if (item.type === "flight" && item.flight) return <FlightTime item={{ ...item, flight: item.flight }} timezone={timezone} />;
  if (item.type === "lodging") return <span className="block space-y-1 text-sm tabular-nums text-muted-foreground"><span className="block">체크인 {label(item.startAt)}</span><span className="block">체크아웃 {item.endAt ? label(item.endAt) : "미입력"}</span></span>;
  return <span className="font-mono text-[13px] font-medium tabular-nums text-muted-foreground">{item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}{!item.allDay && item.endAt ? ` ~ ${zonedDateKey(item.startAt, timezone) === zonedDateKey(item.endAt, timezone) ? zonedTimeLabel(item.endAt, timezone) : label(item.endAt)}` : ""}</span>;
}
