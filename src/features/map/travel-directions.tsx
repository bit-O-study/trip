"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingStatus } from "@/components/ui/loading-status";
import { distanceLabel, durationLabel, type Stop, type TravelLeg } from "@/features/trips/travel";
import { loadGoogleMaps, onMapAuthFailure } from "./google-sdk";
import { directionsUrl, routeDeparture, routeLocation, routeMode, ROUTE_MODES, type RouteMode } from "./directions";

function RouteResult({ from, to, mode }: { from: Stop; to: Stop; mode: RouteMode }) {
  const container = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<google.maps.routes.Route | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let lines: google.maps.Polyline[] = [];
    let markers: google.maps.marker.AdvancedMarkerElement[] = [];
    let map: google.maps.Map | undefined;
    const unsubscribe = onMapAuthFailure(() => { if (!cancelled) setError("이동 지도를 불러오지 못했습니다."); });
    const timeout = window.setTimeout(() => { if (!cancelled) { cancelled = true; setError("경로 조회가 지연되고 있습니다. Google 지도에서 확인해 주세요."); } }, 15000);
    async function load() {
      const origin = routeLocation(from), destination = routeLocation(to);
      if (!origin || !destination) throw new Error("출발·도착 장소의 위치를 먼저 등록해 주세요.");
      const departureTime = routeDeparture(from, mode);
      const maps = await loadGoogleMaps(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
      const { Route } = await google.maps.importLibrary("routes") as google.maps.RoutesLibrary;
      await google.maps.importLibrary("marker");
      const response = await Route.computeRoutes({ origin, destination, travelMode: mode, departureTime, language: "ko", fields: ["path", "legs", "viewport", "durationMillis", "distanceMeters", "warnings"] });
      if (cancelled || !container.current) return;
      const route = response.routes?.[0];
      if (!route?.path?.length) throw new Error("해당 이동수단의 경로를 찾지 못했습니다.");
      map = new maps.Map(container.current, { center: origin, zoom: 13, mapId: "DEMO_MAP_ID", mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: "cooperative" });
      lines = route.createPolylines();
      lines.forEach(line => line.setMap(map!));
      if (route.viewport) map.fitBounds(route.viewport, 30);
      else { const bounds = new maps.LatLngBounds(); route.path.forEach(point => bounds.extend(point)); map.fitBounds(bounds, 30); }
      const created = await route.createWaypointAdvancedMarkers({ map });
      if (cancelled) { created.forEach(marker => { marker.map = null; }); return; }
      markers = created;
      setResult(route);
    }
    load().catch(caught => { if (!cancelled) setError(caught instanceof Error && /먼저 등록|조회할 수|찾지 못/.test(caught.message) ? caught.message : "경로를 불러오지 못했습니다. Google 지도에서 확인해 주세요."); }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; window.clearTimeout(timeout); unsubscribe(); lines.forEach(line => line.setMap(null)); markers.forEach(marker => { marker.map = null; }); if (map) google.maps.event.clearInstanceListeners(map); };
  }, [from, to, mode]);
  const steps = result?.legs?.flatMap(leg => leg.steps ?? []) ?? [];
  return <div className="space-y-3">
    {!result && !error && <LoadingStatus label="이동 경로 찾는 중…" className="py-5" />}
    {error && <p role="status" className="text-sm text-muted-foreground">{error}</p>}
    <div ref={container} aria-label="다음 장소까지 실제 이동 경로" className={!error ? "h-72 w-full rounded-xl" : "hidden"} />
    {result && !error && <>
      <p className="text-sm font-medium">{result.durationMillis != null ? `약 ${durationLabel(Math.ceil(result.durationMillis / 60000))}` : ""}{result.distanceMeters != null ? ` · ${distanceLabel(result.distanceMeters / 1000)}` : ""}</p>
      <p className="text-xs text-muted-foreground">Google 추천 경로 · {from.endAt && !from.allDay && mode === "TRANSIT" ? "일정 종료 시각 출발" : "현재 조회 기준"}</p>
      {steps.length > 0 && <details><summary className="min-h-11 cursor-pointer py-3 text-sm">승하차·도보 안내</summary><ol className="space-y-3 border-l border-border pl-4 text-sm">{steps.map((step, index) => {
        const transit = step.transitDetails;
        return <li key={index}>{transit ? <><p className="font-medium">{transit.transitLine?.shortName || transit.transitLine?.name || "대중교통"}{transit.headsign ? ` · ${transit.headsign} 방면` : ""}</p><p className="text-xs text-muted-foreground">{transit.departureStop?.name} → {transit.arrivalStop?.name}{transit.stopCount ? ` · ${transit.stopCount}개 정류장` : ""}</p></> : <p>{step.instructions || "도보 이동"}</p>}</li>;
      })}</ol></details>}
      {result.warnings?.map(warning => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
    </>}
  </div>;
}

export function TravelDirections({ from, to, leg }: { from: Stop; to: Stop; leg?: TravelLeg }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RouteMode>(routeMode(leg?.mode));
  return <section className="border-t border-border pt-3" aria-label="이동 경로 지도">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-11 w-full text-left text-sm font-medium">{open ? "이동 경로 접기" : "이동 경로 지도 보기"}</button>
    {open && <div className="space-y-3">
      <p className="break-words text-xs text-muted-foreground">{from.title} → {to.title}</p>
      <label className="flex items-center justify-between gap-2 text-sm">길찾기 수단<select aria-label="길찾기 수단" value={mode} onChange={event => setMode(event.target.value as RouteMode)} className="min-h-11 rounded-lg border border-border bg-card px-3">{Object.entries(ROUTE_MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <RouteResult key={`${mode}:${from.id}:${to.id}:${from.endAt}:${JSON.stringify([from.coordinate,to.coordinate])}`} from={from} to={to} mode={mode} />
      <a href={directionsUrl(from, to, mode)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm">Google 지도에서 길찾기</a>
    </div>}
  </section>;
}
