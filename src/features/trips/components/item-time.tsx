import { zonedDateKey, zonedTimeLabel } from "@/lib/datetime";

export function ItemTime({ item, timezone }: { item: { type: string; startAt: string; endAt: string | null; allDay: boolean }; timezone: string }) {
  const label = (at: string) => `${zonedDateKey(at, timezone)} ${zonedTimeLabel(at, timezone)}`;
  if (item.type === "lodging") return <span className="block space-y-1 text-sm tabular-nums text-muted-foreground"><span className="block">체크인 {label(item.startAt)}</span><span className="block">체크아웃 {item.endAt ? label(item.endAt) : "미입력"}</span></span>;
  return <span className="font-mono text-sm tabular-nums text-muted-foreground">{item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}{!item.allDay && item.endAt ? ` ~ ${zonedDateKey(item.startAt, timezone) === zonedDateKey(item.endAt, timezone) ? zonedTimeLabel(item.endAt, timezone) : label(item.endAt)}` : ""}</span>;
}
