import type { Stop, TravelLeg } from "@/features/trips/travel";
import { routeMode } from "./directions";

/** 상세에서 여는 길찾기는 직전 일정 → 현재 일정이다. */
export function detailMapUrl(to: Stop, from?: Stop, leg?: TravelLeg, timezone?: string) {
  const query = (stop: Stop) => {
    const title = stop.title.replace(/\s*·\s*(아침|점심|저녁|간식)$/, "");
    const localName = title.match(/\(([^()]*[\u3400-\u9fff][^()]*)\)$/)?.[1] || title;
    return [localName, stop.locationText?.trim(), timezone === "Asia/Taipei" ? "Taiwan" : null].filter(Boolean).join(", ");
  };
  const place = (stop: Stop) => stop.coordinate ? `${stop.coordinate.latitude},${stop.coordinate.longitude}` : query(stop);
  if (!from || (!from.coordinate && !from.locationText?.trim())) {
    return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: query(to) })}`;
  }
  const params = new URLSearchParams({ api: "1", origin: place(from), destination: place(to) });
  if (leg?.fromId === from.id && leg.toId === to.id && leg.mode && !["flight", "other"].includes(leg.mode)) {
    params.set("travelmode", routeMode(leg.mode).toLowerCase());
  }
  return `https://www.google.com/maps/dir/?${params}`;
}
