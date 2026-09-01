"use client";

import { useState } from "react";
import { deleteItemAction } from "@/features/trips/actions";
import { useBulkItemSelection } from "@/features/trips/components/bulk-delete";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";
import { ItemEditForm } from "@/features/trips/components/item-edit-form";
import { timelineItemDomId, useItemSelection } from "@/features/trips/components/trip-board";
import { ITEM_TYPE_ICONS, ITEM_TYPE_LABELS, type ItineraryItem } from "@/features/trips/types";
import { dayColorVar } from "@/lib/day-color";
import { zonedTimeLabel } from "@/lib/datetime";

type Props = { item: ItineraryItem; order: number; dayIndex: number | null; timezone: string; tripId: string; editable: boolean };
const CONTROL = "rounded-lg border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

function ItemBody({ item, timezone }: { item: ItineraryItem; timezone: string }) {
  return <><span className="flex items-baseline gap-2"><span className="font-mono text-sm tabular-nums text-muted-foreground">{item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}</span><span className="truncate font-medium"><span aria-hidden>{ITEM_TYPE_ICONS[item.type]}</span>{" "}<span className="sr-only">{ITEM_TYPE_LABELS[item.type]}</span>{item.title}</span></span>{item.locationText ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.locationText}</span> : null}{item.note ? <span className="mt-1 block whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</span> : null}</>;
}

export function ItemRow({ item, order, dayIndex, timezone, tripId, editable }: Props) {
  const { selectedId, select } = useItemSelection();
  const selected = selectedId === item.id;
  const [editing, setEditing] = useState(false);
  const bulkSelection = useBulkItemSelection();

  return <li id={timelineItemDomId(item.id)} aria-current={selected ? "true" : undefined} className={`relative scroll-mt-32 rounded-lg border bg-card px-4 py-3 transition-colors ${selected ? "border-primary bg-primary/5" : "border-border"}`}>
    <div className={`flex items-start gap-3 ${editable ? "pr-24" : ""}`}>
      {editable && bulkSelection ? <input type="checkbox" checked={bulkSelection.selected.has(item.id)} onChange={() => bulkSelection.toggle(item.id)} aria-label={`${item.title} 선택`} className="mt-1 size-4 shrink-0" /> : null}
      <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-foreground" style={dayIndex === null ? { background: "var(--muted)", color: "var(--muted-foreground)" } : { background: dayColorVar(dayIndex) }}>{order}</span>
      {item.coordinate ? <button type="button" data-select-item aria-pressed={selected} onClick={() => select(item.id, "timeline")} className="min-w-0 flex-1 rounded text-left"><span className="sr-only">지도에서 보기: </span><ItemBody item={item} timezone={timezone} /></button> : <div className="min-w-0 flex-1"><ItemBody item={item} timezone={timezone} /></div>}
    </div>
    {editable ? <div className="absolute right-3 top-3 flex items-center gap-1.5">
      <button type="button" onClick={() => setEditing((value) => !value)} className={CONTROL}>{editing ? "수정 닫기" : "수정"}</button>
      <form action={deleteItemAction} onSubmit={(event) => { if (!window.confirm(`'${item.title}' 일정을 삭제하시겠습니까?`)) event.preventDefault(); }}><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="tripId" value={tripId} /><DeleteSubmitButton idleLabel="삭제" ariaLabel={`${item.title} 삭제`} testId={`delete-item-${item.id}`} className={`${CONTROL} text-muted-foreground hover:text-danger`} /></form>
    </div> : null}
    {editable && editing ? <ItemEditForm item={item} timezone={timezone} onCancel={() => setEditing(false)} /> : null}
  </li>;
}
