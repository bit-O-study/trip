import { z } from "zod";
import type { ItineraryItem } from "./types";

export const TRAVEL_MODES = ["walk", "bicycle", "car", "taxi", "bus", "subway", "train", "flight", "ferry", "other"] as const;
export const TRAVEL_LABELS: Record<typeof TRAVEL_MODES[number], string> = {
  walk: "도보", bicycle: "자전거", car: "자동차", taxi: "택시", bus: "버스", subway: "지하철", train: "기차", flight: "비행기", ferry: "배", other: "기타",
};
const optionalNumber = (schema: z.ZodType<number, unknown>) => z.preprocess((v) => v === "" || v === null || v === undefined ? null : v, schema.nullable());
export const travelInput = z.object({
  tripId: z.uuid(), fromId: z.uuid(), toId: z.uuid(),
  version: z.coerce.number().int().min(0),
  mode: z.enum(TRAVEL_MODES).nullable(),
  minutes: optionalNumber(z.coerce.number().int().min(0).max(43200)),
  distanceKm: optionalNumber(z.coerce.number().min(0).max(50000)),
}).refine((v) => v.fromId !== v.toId, { message: "서로 다른 일정을 선택하세요." });

export type TravelLeg = {
  tripId: string; fromId: string; toId: string; mode: typeof TRAVEL_MODES[number] | null;
  minutes: number | null; distanceKm: number | null; version: number;
  fromLocationKey: string; toLocationKey: string;
};
export type Stop = Pick<ItineraryItem, "id" | "title" | "coordinate" | "locationText"> & Partial<Pick<ItineraryItem, "startAt" | "endAt" | "allDay">>;
export function locationKey(item: Stop): string {
  return item.coordinate ? `${item.coordinate.latitude},${item.coordinate.longitude}` : (item.locationText ?? item.title);
}
export function legKey(fromId: string, toId: string) { return `${fromId}:${toId}`; }

/** 경로 API 호출 없이 계산하는 두 좌표 사이의 대권 거리. 실제 도로 거리가 아니다. */
export function straightDistanceKm(a: Stop["coordinate"], b: Stop["coordinate"]): number | null {
  if (!a || !b) return null;
  if (![a, b].every((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180)) return null;
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function distanceLabel(km: number) {
  // 반올림한 **뒤에** 단위를 고른다. 0.9996km 를 m 로 반올림하면 "1000m" 가 됐다.
  const meters = Math.round(km * 1000);
  return meters < 1000 ? `${meters}m` : `${km.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}km`;
}
export function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${rest}분`;
}

/** 좌표가 없는 메모도 순서에 포함한다. 없는 위치를 건너뛰어 거리를 꾸미지 않는다. */
export function neighborMap(items: ItineraryItem[]) {
  const stops: Stop[] = items.map(({ id, title, coordinate, locationText, startAt, endAt, allDay }) => ({ id, title, coordinate, locationText, startAt, endAt, allDay }));
  return new Map(stops.map((item, i) => [item.id, { previous: stops[i - 1], next: stops[i + 1] }]));
}

/** 종료 시각·이동시간을 모두 아는 구간만 경고한다. 추정 소요시간은 만들지 않는다. */
export function travelConflictMinutes(from: Stop, to: Stop, leg?: TravelLeg): number | null {
  if (!leg || leg.minutes === null || !from.endAt || !to.startAt || from.allDay || to.allDay) return null;
  if (leg.fromId !== from.id || leg.toId !== to.id || leg.fromLocationKey !== locationKey(from) || leg.toLocationKey !== locationKey(to)) return null;
  const gap = Date.parse(from.endAt) + leg.minutes * 60_000 - Date.parse(to.startAt);
  return Number.isFinite(gap) && gap > 0 ? Math.ceil(gap / 60_000) : null;
}
