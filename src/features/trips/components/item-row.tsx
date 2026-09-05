"use client";

import { useState } from "react";
import {
  deleteItemAction,
  moveItemDownAction,
  moveItemToDayAction,
  moveItemUpAction,
} from "@/features/trips/actions";
import { useBulkItemSelection } from "@/features/trips/components/bulk-delete";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";
import { ItemEditForm } from "@/features/trips/components/item-edit-form";
import { SubmitButton } from "@/features/trips/components/submit-button";
import { timelineItemDomId, useItemSelection } from "@/features/trips/components/trip-board";
import { ITEM_TYPE_ICONS, ITEM_TYPE_LABELS, type ItineraryItem } from "@/features/trips/types";
import { dayColorVar } from "@/lib/day-color";
import { zonedTimeLabel, type TripDay } from "@/lib/datetime";

type Props = {
  item: ItineraryItem;
  order: number;
  dayIndex: number | null;
  timezone: string;
  tripId: string;
  editable: boolean;
  /** 날짜 이동 대상 목록. 여행 기간의 모든 날. */
  days: readonly TripDay[];
  /** 그 날의 첫 항목인가 — "위로" 를 비활성화한다. */
  isFirst: boolean;
  /** 그 날의 마지막 항목인가 — "아래로" 를 비활성화한다. */
  isLast: boolean;
  /** 이 항목이 속한 날짜 키. 날짜 이동 셀렉트의 기본값. */
  dateKey: string;
};

const CONTROL = "rounded-lg border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

function ItemBody({ item, timezone }: { item: ItineraryItem; timezone: string }) {
  return <><span className="flex items-baseline gap-2"><span className="font-mono text-sm tabular-nums text-muted-foreground">{item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}</span><span className="truncate font-medium"><span aria-hidden>{ITEM_TYPE_ICONS[item.type]}</span>{" "}<span className="sr-only">{ITEM_TYPE_LABELS[item.type]}</span>{item.title}</span></span>{item.locationText ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.locationText}</span> : null}{item.note ? <span className="mt-1 block whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</span> : null}</>;
}

/**
 * 순서 이동.
 *
 * 드래그가 아니라 버튼과 셀렉트다. 드래그만 제공하면 키보드·스크린리더
 * 사용자에게는 재정렬 기능이 통째로 사라진다 (AGENTS.md). 나중에 드래그를
 * 얹더라도 이 경로는 대체 수단으로 남는다.
 *
 * "무엇을 어느 방향으로" 만 보내고 실제 자리 계산은 서버가 다시 한다 —
 * 화면이 오래됐을 수 있기 때문이다 (actions.ts 의 applyMove 주석 참고).
 */
function MoveControls({ item, tripId, days, isFirst, isLast, dateKey }: Omit<Props, "order" | "dayIndex" | "timezone" | "editable">) {
  const hidden = (
    <>
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="tripId" value={tripId} />
    </>
  );

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={moveItemUpAction}>
          {hidden}
          <SubmitButton
            idleLabel="↑ 위로"
            pendingLabel="이동 중…"
            disabled={isFirst}
            ariaLabel={`${item.title} 위로 이동`}
            testId={`move-up-${item.id}`}
            className={CONTROL}
          />
        </form>
        <form action={moveItemDownAction}>
          {hidden}
          <SubmitButton
            idleLabel="↓ 아래로"
            pendingLabel="이동 중…"
            disabled={isLast}
            ariaLabel={`${item.title} 아래로 이동`}
            testId={`move-down-${item.id}`}
            className={CONTROL}
          />
        </form>
      </div>

      {days.length > 0 ? (
        <form action={moveItemToDayAction} className="flex flex-wrap items-center gap-2">
          {hidden}
          <label htmlFor={`move-day-${item.id}`} className="text-xs font-medium text-muted-foreground">
            날짜 이동
          </label>
          <select
            id={`move-day-${item.id}`}
            name="date"
            defaultValue={dateKey}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
          >
            {days.map((day) => (
              <option key={day.date} value={day.date}>
                Day {day.index + 1} · {day.shortLabel}({day.weekday})
              </option>
            ))}
          </select>
          <SubmitButton
            idleLabel="이동"
            pendingLabel="이동 중…"
            ariaLabel={`${item.title} 다른 날짜로 이동`}
            testId={`move-day-submit-${item.id}`}
            className={CONTROL}
          />
        </form>
      ) : null}
    </div>
  );
}

export function ItemRow({ item, order, dayIndex, timezone, tripId, editable, days, isFirst, isLast, dateKey }: Props) {
  const { selectedId, select } = useItemSelection();
  const selected = selectedId === item.id;
  const [panel, setPanel] = useState<"edit" | "move" | null>(null);
  const bulkSelection = useBulkItemSelection();

  return <li id={timelineItemDomId(item.id)} aria-current={selected ? "true" : undefined} className={`relative scroll-mt-32 rounded-lg border bg-card px-4 py-3 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border"}`}>
    <div className={`flex items-start gap-3 ${editable ? "pr-36" : ""}`}>
      {editable && bulkSelection ? <input type="checkbox" checked={bulkSelection.selected.has(item.id)} onChange={() => bulkSelection.toggle(item.id)} aria-label={`${item.title} 선택`} className="mt-1 size-4 shrink-0" /> : null}
      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-foreground" style={dayIndex === null ? { background: "var(--muted)", color: "var(--muted-foreground)" } : { background: dayColorVar(dayIndex) }}>{order}</span>
      {item.coordinate ? <button type="button" data-select-item aria-pressed={selected} onClick={() => select(item.id, "timeline")} className="min-w-0 flex-1 rounded text-left"><span className="sr-only">지도에서 보기: </span><ItemBody item={item} timezone={timezone} /></button> : <div className="min-w-0 flex-1"><ItemBody item={item} timezone={timezone} /></div>}
    </div>
    {editable ? <div className="absolute right-3 top-3 flex items-center gap-1.5">
      <button type="button" aria-expanded={panel === "move"} aria-label={`${item.title} 순서 이동`} onClick={() => setPanel((value) => (value === "move" ? null : "move"))} className={CONTROL}>{panel === "move" ? "이동 닫기" : "이동"}</button>
      <button type="button" aria-expanded={panel === "edit"} onClick={() => setPanel((value) => (value === "edit" ? null : "edit"))} className={CONTROL}>{panel === "edit" ? "수정 닫기" : "수정"}</button>
      <form action={deleteItemAction} onSubmit={(event) => { if (!window.confirm(`'${item.title}' 일정을 삭제하시겠습니까?`)) event.preventDefault(); }}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="tripId" value={tripId} /><DeleteSubmitButton idleLabel="삭제" ariaLabel={`${item.title} 삭제`} testId={`delete-item-${item.id}`} className={`${CONTROL} text-muted-foreground hover:text-danger`} /></form>
    </div> : null}
    {editable && panel === "move" ? <MoveControls item={item} tripId={tripId} days={days} isFirst={isFirst} isLast={isLast} dateKey={dateKey} /> : null}
    {editable && panel === "edit" ? <ItemEditForm item={item} timezone={timezone} onCancel={() => setPanel(null)} /> : null}
  </li>;
}
