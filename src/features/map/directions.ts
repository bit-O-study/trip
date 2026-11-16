import type { Stop, TravelLeg } from "@/features/trips/travel";

export const ROUTE_MODES = { TRANSIT: "대중교통", WALKING: "도보", DRIVING: "자동차", BICYCLING: "자전거" } as const;
export type RouteMode = keyof typeof ROUTE_MODES;
export function routeMode(mode?: TravelLeg["mode"]): RouteMode {
  if (mode === "walk") return "WALKING";
  if (mode === "bicycle") return "BICYCLING";
  if (mode === "car" || mode === "taxi") return "DRIVING";
  return "TRANSIT";
}
export function routeLocation(stop: Stop) {
  return stop.coordinate ? { lat: stop.coordinate.latitude, lng: stop.coordinate.longitude } : null;
}
export function directionsUrl(from: Stop, to: Stop, mode: RouteMode) {
  const place = (stop: Stop) => stop.coordinate ? `${stop.coordinate.latitude},${stop.coordinate.longitude}` : stop.locationText || stop.title;
  const params = new URLSearchParams({ api: "1", origin: place(from), destination: place(to), travelmode: mode.toLowerCase() });
  return `https://www.google.com/maps/dir/?${params}`;
}
/** Transit lookup supports only a bounded date range. Never silently use a different travel date. */
export function routeDeparture(from: Stop, mode: RouteMode, now = Date.now()): Date | undefined {
  if (from.allDay || !from.endAt) return undefined;
  const time = Date.parse(from.endAt);
  if (!Number.isFinite(time)) return undefined;
  if (mode === "TRANSIT" && (time < now - 7 * 86400000 || time > now + 100 * 86400000)) throw new Error("이 일정 날짜의 경로는 조회할 수 없습니다. Google 지도에서 날짜를 변경해 확인해 주세요.");
  if (mode !== "TRANSIT") return undefined;
  return new Date(time);
}