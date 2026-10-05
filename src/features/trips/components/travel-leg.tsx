"use client";

import { useActionState, useState } from "react";
import { IDLE } from "../action-state";
import { saveTravelLeg } from "@/features/trips/travel-actions";
import { distanceLabel, durationLabel, locationKey, straightDistanceKm, TRAVEL_LABELS, TRAVEL_MODES, type Stop, type TravelLeg } from "../travel";

const field = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
export function TravelLegView({ tripId, from, to, leg, editable, direction, onExpandedChange }: { tripId: string; from: Stop; to: Stop; leg?: TravelLeg; editable: boolean; direction: "previous" | "next"; onExpandedChange?: (open: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(saveTravelLeg, IDLE);
  const stale = leg && (leg.fromLocationKey !== locationKey(from) || leg.toLocationKey !== locationKey(to));
  const manual = !stale && leg?.distanceKm !== null && leg?.distanceKm !== undefined;
  const distance = manual ? leg!.distanceKm : straightDistanceKm(from.coordinate, to.coordinate);
  return <section className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-xs" aria-label={direction === "previous" ? "이전 일정과 이동" : "다음 일정과 이동"}>
    <p className="break-words font-medium">{direction === "previous" ? `이전 · ${from.title}에서` : `다음 · ${to.title}까지`}</p>
    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground">
      <span>{distance === null ? "좌표가 없어 거리 계산 불가" : `${manual ? "입력한 이동거리" : "직선거리"} ${distanceLabel(distance!)}`}</span>
      <span>{leg?.mode ? TRAVEL_LABELS[leg.mode] : "이동수단 미입력"}</span>
      <span>{leg?.minutes === null || leg?.minutes === undefined ? "이동시간 미입력" : durationLabel(leg.minutes)}</span>
    </p>
    {stale && <p className="mt-1 text-danger">장소가 바뀌었습니다. 이동 정보를 다시 확인하세요.</p>}
    {editable && <details onToggle={(event) => { const open = event.currentTarget.open; setExpanded(open); onExpandedChange?.(open); }} className="mt-2" onPointerDown={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer py-1 font-medium text-primary">이동 정보 {leg ? "수정" : "입력"}</summary>
      {expanded && <form key={leg?.version ?? 0} action={action} className="mt-2 space-y-3">
        <input type="hidden" name="tripId" value={tripId} /><input type="hidden" name="fromId" value={from.id} /><input type="hidden" name="toId" value={to.id} /><input type="hidden" name="version" value={leg?.version ?? 0} />
        <label className="block space-y-1"><span>이동수단</span><select aria-label="이동수단" name="mode" defaultValue={leg?.mode ?? ""} className={field}><option value="">선택 안 함</option>{TRAVEL_MODES.map((mode) => <option key={mode} value={mode}>{TRAVEL_LABELS[mode]}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1"><span>이동시간 (분)</span><input type="number" inputMode="numeric" name="minutes" min="0" max="43200" step="1" defaultValue={leg?.minutes ?? ""} placeholder="예: 90" className={field} /></label>
          <label className="block space-y-1"><span>실제 이동거리 (km, 선택)</span><input type="number" inputMode="decimal" name="distanceKm" min="0" max="50000" step="any" defaultValue={stale ? "" : leg?.distanceKm ?? ""} placeholder="비우면 직선거리" className={field} /></label>
        </div>
        <p className="text-muted-foreground">직선거리는 실제 도로·노선 거리와 다릅니다. 소요시간은 직접 입력하세요.</p>
        {state.message && <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p>}
        <button disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">{pending ? "저장 중…" : "이동 정보 저장"}</button>
      </form>}
    </details>}
  </section>;
}
