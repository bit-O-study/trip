"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/toast";
import { deleteItemAction, restoreItemsAction } from "@/features/trips/actions";
import { useBulkItemSelection } from "./bulk-delete";
import { ItemEditForm } from "./item-edit-form";
import { ItemTime } from "./item-time";
import { TravelLegView } from "./travel-leg";
import { timelineItemDomId, useItemSelection, useItineraryView } from "./trip-board";
import { ITEM_TYPE_LABELS, type ItineraryItem } from "../types";
import { durationLabel, TRAVEL_LABELS, type Stop, type TravelLeg } from "../travel";
import { dayColorVar, lineLetter } from "@/lib/day-color";
import type { TripDay } from "@/lib/datetime";

type Props = {
  item: ItineraryItem; previous?: Stop; next?: Stop; previousLeg?: TravelLeg; nextLeg?: TravelLeg;
  order: number; dayIndex: number | null; timezone: string; tripId: string;
  editable: boolean; travelEditable?: boolean;
  days: readonly TripDay[]; isFirst: boolean; isLast: boolean; dateKey: string;
};
const CONTROL = "min-h-11 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40";

function DetailDialog({ item, timezone, editable, onClose, onDelete, deleting, children }: {
  item: ItineraryItem; timezone: string; editable: boolean; onClose: () => void;
  onDelete: () => void; deleting: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; opener?.focus(); };
  }, []);
  // 네이티브 모달로 포커스를 가두고 Esc·배경 클릭·닫기 모두 같은 경로를 쓴다.
  return createPortal(<dialog ref={ref} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]')).filter(node => node.getClientRects().length > 0);
    const first = nodes[0], last = nodes.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} aria-labelledby={`detail-title-${item.id}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-0 text-foreground shadow-[var(--shadow-lift)] backdrop:bg-black/45">
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">일정 상세 · {ITEM_TYPE_LABELS[item.type]}</p><h3 id={`detail-title-${item.id}`} className="mt-1 break-words text-lg font-semibold">{item.title}</h3></div>
        <button type="button" onClick={onClose} aria-label="일정 상세 닫기" className={`${CONTROL} shrink-0`}>닫기</button>
      </div>
      {editing ? <ItemEditForm item={item} timezone={timezone} onCancel={() => setEditing(false)} /> : <div className="mt-4 space-y-3">
        <ItemTime item={item} timezone={timezone} />
        {item.locationText ? <p className="break-words text-sm">{item.locationText}</p> : null}
        {item.note ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.note}</p> : null}
        {children}
        {editable ? <div className="flex flex-wrap gap-2 border-t border-border pt-3"><button type="button" onClick={() => setEditing(true)} className={CONTROL}>수정</button><button type="button" disabled={deleting} onClick={onDelete} aria-label={`${item.title} 삭제`} className={`${CONTROL} text-danger`}>{deleting ? "삭제 중…" : "삭제"}</button><p className="w-full text-xs text-muted-foreground">수정에서 날짜·시간을 바꾸면 시간순으로 자동 정렬됩니다.</p></div> : null}
      </div>}
    </div>
  </dialog>, document.body);
}

export function ItemRow({ item, order, dayIndex, timezone, tripId, editable, travelEditable = editable, previous, next, previousLeg, nextLeg }: Props) {
  const { selectedId, select } = useItemSelection();
  const view = useItineraryView();
  const selected = selectedId === item.id;
  const [open, setOpen] = useState(false);
  const bulk = useBulkItemSelection();
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  function remove() {
    startDelete(async () => {
      const data = new FormData(); data.set("itemId", item.id); data.set("tripId", tripId);
      try {
        await deleteItemAction(data); setOpen(false);
        toast.show({ message: `'${item.title}' 일정을 삭제했습니다.`, actionLabel: "되돌리기", onAction: async () => {
          try { await restoreItemsAction(tripId, [item.id]); toast.show({ message: "일정을 되돌렸습니다." }); }
          catch { toast.show({ message: "되돌리지 못했습니다. 다시 시도하세요.", tone: "error" }); }
        } });
      } catch { toast.show({ message: "삭제하지 못했습니다. 다시 시도하세요.", tone: "error" }); }
    });
  }
  const travel = <>
    {previous ? <TravelLegView tripId={tripId} from={previous} to={item} leg={previousLeg} editable={travelEditable} direction="previous" /> : null}
    {next ? <TravelLegView tripId={tripId} from={item} to={next} leg={nextLeg} editable={travelEditable} direction="next" /> : null}
  </>;
  return <li id={timelineItemDomId(item.id)} aria-current={selected ? "true" : undefined} data-item-id={item.id} style={{ "--line": dayIndex === null ? "var(--rail)" : dayColorVar(dayIndex) } as CSSProperties} className="relative grid min-w-0 scroll-mt-28 grid-cols-[1rem_minmax(0,1fr)] gap-x-2">
    <div aria-hidden className="line-rail"><i className="line-station" /></div>
    <div className={`mb-2 min-w-0 rounded-xl border bg-card p-3 shadow-[var(--shadow-card)] ${selected ? "border-foreground" : "border-border"}`}>
      <div className="flex min-w-0 items-start gap-2">
        {editable && bulk ? <input type="checkbox" checked={bulk.selected.has(item.id)} onChange={() => bulk.toggle(item.id)} aria-label={`${item.title} 선택`} className="mt-3 size-4 shrink-0" /> : null}
        <span aria-hidden className="line-code mt-1 size-8 shrink-0 text-xs" style={dayIndex === null ? { background: "var(--muted)", color: "var(--muted-foreground)" } : undefined}>{dayIndex === null ? "·" : lineLetter(dayIndex)}{order}</span>
        <button type="button" data-select-item aria-label={`${item.title} 상세 보기`} aria-haspopup="dialog" onClick={() => { setOpen(true); if (item.coordinate && !selected) select(item.id, "timeline"); }} className="min-h-11 min-w-0 flex-1 rounded text-left">
          <ItemTime item={item} timezone={timezone} />
          <span className="block break-words text-sm font-semibold leading-snug">{item.title}</span>
          {item.locationText ? <span className={`mt-1 block text-xs text-muted-foreground ${view === "detailed" ? "break-words" : "truncate"}`}>{item.locationText}</span> : null}
          {view === "detailed" && item.note ? <span className="mt-2 block whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.note}</span> : null}
        </button>
        {item.coordinate ? <button type="button" aria-label={`지도에서 보기: ${item.title}`} aria-pressed={selected} onClick={() => select(item.id, "timeline")} className="min-h-11 shrink-0 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted">지도</button> : null}
      </div>
      {view === "travel" && next ? <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">{nextLeg?.mode ? TRAVEL_LABELS[nextLeg.mode] : "이동수단 미입력"}{nextLeg?.minutes != null ? ` · ${durationLabel(nextLeg.minutes)}` : ""} → {next.title}</p> : null}
      {view === "detailed" && (previous || next) ? <div className="mt-3 space-y-2">{next ? <TravelLegView tripId={tripId} from={item} to={next} leg={nextLeg} editable={false} direction="next" /> : null}</div> : null}
    </div>
    {open ? <DetailDialog item={item} timezone={timezone} editable={editable} onClose={() => setOpen(false)} onDelete={remove} deleting={deleting}><div className="space-y-2">{travel}</div></DetailDialog> : null}
  </li>;
}
