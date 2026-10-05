"use client";

import { useState } from "react";
import { useItemDrag } from "./use-item-drag";
import {
  deleteItemAction,
  moveItemToDayAction,
} from "@/features/trips/actions";
import { useBulkItemSelection } from "@/features/trips/components/bulk-delete";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";
import { ItemEditForm } from "@/features/trips/components/item-edit-form";
import { SubmitButton } from "@/features/trips/components/submit-button";
import { timelineItemDomId, useItemSelection } from "@/features/trips/components/trip-board";
import { ITEM_TYPE_LABELS, type ItineraryItem } from "@/features/trips/types";
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
  return <><span className="flex min-w-0 flex-wrap items-baseline gap-2"><span className="font-mono text-sm tabular-nums text-muted-foreground">{item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}</span><span className="min-w-0 break-words font-medium"><span className="sr-only">{ITEM_TYPE_LABELS[item.type]}</span>{item.title}</span></span>{item.locationText ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.locationText}</span> : null}{item.note ? <span className="mt-1 block whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</span> : null}</>;
}

/** 드래그 외에 키보드로 날짜를 바꾸는 경로. 순서는 카드에서 Alt+방향키로 이동한다. */
function MoveControls({ item, tripId, days, dateKey }: Omit<Props, "order" | "dayIndex" | "timezone" | "editable">) {
  const hidden = (
    <>
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="tripId" value={tripId} />
    </>
  );

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
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
  const { dragging, pending, message, ...dragEvents } = useItemDrag(tripId, item.id, editable && panel === null);

  return <li {...dragEvents} data-drag-item={editable ? item.id : undefined} data-trip-id={tripId} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${item.title}, 끌어서 이동. Alt와 위아래 방향키로 순서 변경` : undefined} aria-busy={pending} id={timelineItemDomId(item.id)} aria-current={selected ? "true" : undefined} className={`relative min-w-0 scroll-mt-32 ${dragging ? "opacity-50" : ""} ${editable && panel === null ? "touch-none cursor-grab" : ""} rounded-lg border bg-card px-4 py-3 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border"}`}>
    <div className="flex min-w-0 items-start gap-3">
      {editable && bulkSelection ? <input type="checkbox" checked={bulkSelection.selected.has(item.id)} onChange={() => bulkSelection.toggle(item.id)} aria-label={`${item.title} 선택`} className="mt-1 size-4 shrink-0" /> : null}
      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-foreground" style={dayIndex === null ? { background: "var(--muted)", color: "var(--muted-foreground)" } : { background: dayColorVar(dayIndex) }}>{order}</span>
      {item.coordinate ? <button type="button" data-select-item aria-pressed={selected} onClick={() => select(item.id, "timeline")} className="min-w-0 flex-1 rounded text-left"><span className="sr-only">지도에서 보기: </span><ItemBody item={item} timezone={timezone} /></button> : <div className="min-w-0 flex-1"><ItemBody item={item} timezone={timezone} /></div>}
    </div>
    {editable ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
      <button type="button" aria-expanded={panel === "move"} aria-label={`${item.title} 순서 이동`} onClick={() => setPanel((value) => (value === "move" ? null : "move"))} className={CONTROL}>{panel === "move" ? "날짜 이동 닫기" : "날짜 이동"}</button>
      <button type="button" aria-expanded={panel === "edit"} onClick={() => setPanel((value) => (value === "edit" ? null : "edit"))} className={CONTROL}>{panel === "edit" ? "수정 닫기" : "수정"}</button>
      <form action={deleteItemAction} onSubmit={(event) => { if (!window.confirm(`'${item.title}' 일정을 삭제하시겠습니까?`)) event.preventDefault(); }}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="tripId" value={tripId} /><DeleteSubmitButton idleLabel="삭제" ariaLabel={`${item.title} 삭제`} testId={`delete-item-${item.id}`} className={`${CONTROL} text-muted-foreground hover:text-danger`} /></form>
    </div> : null}
    {editable && panel === "move" ? <MoveControls item={item} tripId={tripId} days={days} isFirst={isFirst} isLast={isLast} dateKey={dateKey} /> : null}
    {editable && panel === "edit" ? <ItemEditForm item={item} timezone={timezone} onCancel={() => setPanel(null)} /> : null}
    {message || pending ? <p role="status" className="mt-2 text-xs text-muted-foreground">{pending ? "이동 중…" : message}</p> : null}
  </li>;
}
