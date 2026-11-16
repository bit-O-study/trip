"use client";

import { useActionState, useState } from "react";
import dynamic from "next/dynamic";
import { LoadingStatus } from "@/components/ui/loading-status";
import { flightTime, type LegFlight } from "@/features/flights/leg-flight";
import { zonedDateKey } from "@/lib/datetime";
import { IDLE } from "../action-state";
import { saveTravelLeg } from "@/features/trips/travel-actions";
import { distanceLabel, durationLabel, locationKey, straightDistanceKm, travelConflictMinutes, travelSummary, TRAVEL_LABELS, TRAVEL_MODES, type Stop, type TravelLeg } from "../travel";

const field = "w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-base";
const FlightLegLookup = dynamic(() => import("@/features/flights/components/flight-leg-lookup").then(m => m.FlightLegLookup), {loading: () => <LoadingStatus label="항공편 검색 준비 중…" />});
function FlightDetails({flight}: {flight:LegFlight}) {
  return <div className="space-y-1 text-xs text-muted-foreground"><p>{flight.airlineName} · {flight.flightNumber}</p><p>{flight.departure.airport} {flightTime(flight.departure)} → {flight.arrival.airport} {flightTime(flight.arrival)}</p><p>각 공항 현지 시각</p></div>;
}
export function TravelLegView({ tripId, from, to, leg, editable, timezone = "UTC" }: { tripId: string; from: Stop; to: Stop; leg?: TravelLeg; editable: boolean; timezone?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState(leg?.mode ?? "");
  const [routeLabel, setRouteLabel] = useState(leg?.routeLabel ?? "");
  const [minutes, setMinutes] = useState(String(leg?.minutes ?? ""));
  const [flightSnapshot, setFlightSnapshot] = useState<LegFlight | null>(leg?.flightSnapshot ?? null);
  const routePlaceholder = mode === "flight" ? "예: CI165, KE185" : mode === "ferry" ? "예: 구산–치진 페리, 선박명" : mode === "subway" ? "예: 2호선, 레드라인" : mode === "bus" ? "예: 88번, 100번" : "노선이나 편명을 입력하세요";
  const [state, action, pending] = useActionState(saveTravelLeg, IDLE);
  const stale = leg && (leg.fromLocationKey !== locationKey(from) || leg.toLocationKey !== locationKey(to));
  const manual = !stale && leg?.distanceKm != null;
  const distance = manual ? leg!.distanceKm : straightDistanceKm(from.coordinate, to.coordinate);
  const conflict = travelConflictMinutes(from, to, leg);
  return <section className="min-w-0 rounded-xl border border-border px-3 py-3 text-sm" aria-label="다음 장소로 이동">
    <p className="text-xs text-muted-foreground">다음 장소로 이동</p>
    <p className="mt-1 break-words font-medium">{to.title}</p>
    {travelSummary(leg) && <p className="mt-2 break-words">{travelSummary(leg)}</p>}
    {leg?.mode === "flight" && leg.flightSnapshot && !expanded && <FlightDetails flight={leg.flightSnapshot} />}
    {stale && <p className="mt-2 text-xs text-danger">장소가 바뀌었습니다. 이동 정보를 확인해 주세요.</p>}
    {conflict !== null && <p role="status" className="mt-2 text-xs text-danger">이동시간이 {durationLabel(conflict)} 부족합니다.</p>}
    {editable && <details onToggle={event => setExpanded(event.currentTarget.open)} className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">{leg ? "이동수단 수정" : "이동수단 추가"}</summary>
      {expanded && <form key={leg?.version ?? 0} action={action} className="mt-2 space-y-3" aria-busy={pending}>
        <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="fromId" value={from.id} /><input type="hidden" name="toId" value={to.id} /><input type="hidden" name="version" value={leg?.version ?? 0} />
        <input type="hidden" name="flightSnapshot" value={mode === "flight" && flightSnapshot ? JSON.stringify(flightSnapshot) : ""} />
        <fieldset disabled={pending} className="space-y-3 disabled:opacity-60">
          <label className="block space-y-1"><span>이동수단</span><select aria-label="이동수단" name="mode" value={mode} onChange={event => setMode(event.target.value as typeof mode)} className={field}><option value="">선택</option>{TRAVEL_MODES.map(mode => <option key={mode} value={mode}>{TRAVEL_LABELS[mode]}</option>)}</select></label>
          {mode === "flight" && <FlightLegLookup initialNumber={routeLabel} defaultDate={zonedDateKey(from.endAt || from.startAt || new Date(), timezone)} onSelect={flight => {setFlightSnapshot(flight);setRouteLabel(flight.flightNumber);setMinutes(String(Math.round((Date.parse(flight.arrival.scheduledAt)-Date.parse(flight.departure.scheduledAt))/60000)));}} />}
          {mode === "flight" && flightSnapshot && <FlightDetails flight={flightSnapshot} />}
          <label className="block space-y-1"><span>번호·노선·편명 (선택)</span><input name="routeLabel" maxLength={100} value={routeLabel} onChange={event => {setRouteLabel(event.target.value);setFlightSnapshot(null);}} placeholder={routePlaceholder} className={field} /></label>
          <label className="block space-y-1"><span>이동시간 (분, 선택)</span><input type="number" inputMode="numeric" name="minutes" min="0" max="43200" step="1" value={minutes} onChange={event => setMinutes(event.target.value)} placeholder="예: 20" className={field} /></label>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-2">거리 정보</summary>
            {distance != null && <p className="my-2">{manual ? "입력한 이동거리" : "직선거리"} {distanceLabel(distance!)}{!manual && " · 실제 경로와 다를 수 있습니다."}</p>}
            <label className="block space-y-1"><span>실제 이동거리 (km, 선택)</span><input type="number" inputMode="decimal" name="distanceKm" min="0" max="50000" step="any" defaultValue={stale ? "" : leg?.distanceKm ?? ""} className={field} /></label>
          </details>
          <button className="min-h-11 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground">{pending ? "저장 중…" : "이동수단 저장"}</button>
        </fieldset>
        {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
      </form>}
    </details>}
  </section>;
}
