"use client";

import { useActionState, useState } from "react";
import { IDLE } from "../action-state";
import { saveTravelLeg } from "@/features/trips/travel-actions";
import { distanceLabel, durationLabel, locationKey, straightDistanceKm, travelConflictMinutes, travelSummary, TRAVEL_LABELS, TRAVEL_MODES, type Stop, type TravelLeg } from "../travel";

const field = "w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-base";
export function TravelLegView({ tripId, from, to, leg, editable }: { tripId: string; from: Stop; to: Stop; leg?: TravelLeg; editable: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(saveTravelLeg, IDLE);
  const stale = leg && (leg.fromLocationKey !== locationKey(from) || leg.toLocationKey !== locationKey(to));
  const manual = !stale && leg?.distanceKm != null;
  const distance = manual ? leg!.distanceKm : straightDistanceKm(from.coordinate, to.coordinate);
  const conflict = travelConflictMinutes(from, to, leg);
  return <section className="min-w-0 rounded-xl border border-border px-3 py-3 text-sm" aria-label="다음 장소로 이동">
    <p className="text-xs text-muted-foreground">다음 장소로 이동</p>
    <p className="mt-1 break-words font-medium">{to.title}</p>
    {travelSummary(leg) && <p className="mt-2 break-words">{travelSummary(leg)}</p>}
    {stale && <p className="mt-2 text-xs text-danger">장소가 바뀌었습니다. 이동 정보를 확인해 주세요.</p>}
    {conflict !== null && <p role="status" className="mt-2 text-xs text-danger">이동시간이 {durationLabel(conflict)} 부족합니다.</p>}
    {editable && <details onToggle={event => setExpanded(event.currentTarget.open)} className="mt-2">
      <summary className="min-h-11 cursor-pointer py-3 font-medium">{leg ? "이동수단 수정" : "이동수단 추가"}</summary>
      {expanded && <form key={leg?.version ?? 0} action={action} className="mt-2 space-y-3" aria-busy={pending}>
        <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="fromId" value={from.id} /><input type="hidden" name="toId" value={to.id} /><input type="hidden" name="version" value={leg?.version ?? 0} />
        <fieldset disabled={pending} className="space-y-3 disabled:opacity-60">
          <label className="block space-y-1"><span>이동수단</span><select aria-label="이동수단" name="mode" defaultValue={leg?.mode ?? ""} className={field}><option value="">선택</option>{TRAVEL_MODES.map(mode => <option key={mode} value={mode}>{TRAVEL_LABELS[mode]}</option>)}</select></label>
          <label className="block space-y-1"><span>번호·노선 (선택)</span><input name="routeLabel" maxLength={100} defaultValue={leg?.routeLabel ?? ""} placeholder="예: 88번, 2호선, 레드라인" className={field} /></label>
          <label className="block space-y-1"><span>이동시간 (분, 선택)</span><input type="number" inputMode="numeric" name="minutes" min="0" max="43200" step="1" defaultValue={leg?.minutes ?? ""} placeholder="예: 20" className={field} /></label>
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
