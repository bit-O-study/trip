"use client";

import { ItemTime } from "./item-time";
import { TravelLegView } from "./travel-leg";
import { legKey, type Stop, type TravelLeg } from "../travel";
import { useState, useTransition, type CSSProperties } from "react";
import { useToast } from "@/components/ui/toast";
import { reportMove } from "./move-feedback";
import { useItemDrag } from "./use-item-drag";
import {
  deleteItemAction,
  moveItemDownAction,
  moveItemToDayAction,
  moveItemUpAction,
  restoreItemsAction,
} from "@/features/trips/actions";
import { useBulkItemSelection } from "@/features/trips/components/bulk-delete";
import { ItemEditForm } from "@/features/trips/components/item-edit-form";
import { SubmitButton } from "@/features/trips/components/submit-button";
import { timelineItemDomId, useItemSelection } from "@/features/trips/components/trip-board";
import { ITEM_TYPE_LABELS, type ItineraryItem } from "@/features/trips/types";
import { dayColorVar, lineLetter } from "@/lib/day-color";
import { type TripDay } from "@/lib/datetime";

type Props = {
  item: ItineraryItem;
  previous?: Stop;
  next?: Stop;
  previousLeg?: TravelLeg;
  nextLeg?: TravelLeg;
  order: number;
  dayIndex: number | null;
  timezone: string;
  tripId: string;
  editable: boolean;
  travelEditable?: boolean;
  /** 날짜 이동 대상 목록. 여행 기간의 모든 날. */
  days: readonly TripDay[];
  /** 그 날의 첫 항목인가 — "위로" 를 비활성화한다. */
  isFirst: boolean;
  /** 그 날의 마지막 항목인가 — "아래로" 를 비활성화한다. */
  isLast: boolean;
  /** 이 항목이 속한 날짜 키. 날짜 이동 셀렉트의 기본값. */
  dateKey: string;
};

const CONTROL = "rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

function ItemBody({ item, timezone }: { item: ItineraryItem; timezone: string }) {
  return <><span className="flex min-w-0 flex-col gap-0.5"><ItemTime item={item} timezone={timezone} /><span className="min-w-0 break-words text-base font-semibold leading-snug"><span className="sr-only">{ITEM_TYPE_LABELS[item.type]}</span>{item.title}</span></span>{item.locationText ? <span className="mt-0.5 block truncate text-sm text-muted-foreground">{item.locationText}</span> : null}{item.note ? <span className="mt-1 block break-words whitespace-pre-wrap text-sm text-muted-foreground">{item.note}</span> : null}</>;
}

/** 드래그 외에 키보드로 날짜를 바꾸는 경로. 순서는 카드에서 Alt+방향키로 이동한다. */
function MoveControls({ item, tripId, days, dateKey, isFirst, isLast }: Omit<Props, "order" | "dayIndex" | "timezone" | "editable">) {
  const [message, setMessage] = useState("");
  const [busy, startMove] = useTransition();
  const toast = useToast();
  /** 같은 날 안에서 한 칸 위·아래로. 끌기가 어려운 사람과 키보드 사용자를 위한 버튼 경로다. */
  function step(action: typeof moveItemUpAction) {
    const data = new FormData();
    data.set("itemId", item.id);
    data.set("tripId", tripId);
    startMove(async () => {
      try {
        setMessage(reportMove(await action(data), { tripId, itemId: item.id, show: toast.show }));
      } catch {
        setMessage("이동하지 못했습니다. 다시 시도하세요.");
      }
    });
  }
  async function move(formData: FormData) {
    try {
      const result = await moveItemToDayAction(formData);
      setMessage(result.status === "unchanged" ? "이미 같은 날짜에 있습니다." : reportMove(result, { tripId, itemId: item.id, show: toast.show }));
    } catch {
      setMessage("이동하지 못했습니다. 다시 시도하세요.");
    }
  }
  const hidden = (
    <>
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="tripId" value={tripId} />
    </>
  );

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">순서</span>
        <button type="button" disabled={isFirst || busy} onClick={() => step(moveItemUpAction)} aria-label={`${item.title} 한 칸 위로`} className={CONTROL}>위로</button>
        <button type="button" disabled={isLast || busy} onClick={() => step(moveItemDownAction)} aria-label={`${item.title} 한 칸 아래로`} className={CONTROL}>아래로</button>
      </div>
      {days.length > 0 ? (
        <form action={move} className="flex flex-wrap items-center gap-2">
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
      {message ? <p role="status" className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

export function ItemRow({ item, order, dayIndex, timezone, tripId, editable, travelEditable = editable, days, isFirst, isLast, dateKey, previous, next, previousLeg, nextLeg }: Props) {
  const { selectedId, select } = useItemSelection();
  const selected = selectedId === item.id;
  const [panel, setPanel] = useState<"edit" | "move" | null>(null);
  const [previousOpen, setPreviousOpen] = useState(false);
  const [nextOpen, setNextOpen] = useState(false);
  const dragEnabled = editable && panel === null && !previousOpen && !nextOpen;
  const bulkSelection = useBulkItemSelection();
  const { dragging, pressing, pending, message, ...dragEvents } = useItemDrag(tripId, item.id, dragEnabled);
  const toast = useToast();
  const [deleting, startDelete] = useTransition();
  /** 먼저 지우고 알림에서 되돌릴 수 있게 한다. 지우기는 소프트 삭제라 복구가 가능하다. */
  function remove() {
    startDelete(async () => {
      const data = new FormData();
      data.set("itemId", item.id);
      data.set("tripId", tripId);
      try {
        await deleteItemAction(data);
        toast.show({
          message: `'${item.title}' 일정을 삭제했습니다.`,
          actionLabel: "되돌리기",
          onAction: async () => {
            try {
              await restoreItemsAction(tripId, [item.id]);
              toast.show({ message: "일정을 되돌렸습니다." });
            } catch {
              toast.show({ message: "되돌리지 못했습니다. 다시 시도하세요.", tone: "error" });
            }
          },
        });
      } catch {
        toast.show({ message: "삭제하지 못했습니다. 이미 삭제되었거나 권한이 없을 수 있어요.", tone: "error" });
      }
    });
  }

  return <li {...dragEvents} data-drag-item={editable ? item.id : undefined} data-trip-id={tripId} tabIndex={editable ? 0 : undefined} aria-label={editable ? `${item.title}, 끌어서 이동. Alt와 위아래 방향키로 순서 변경` : undefined} aria-busy={pending} id={timelineItemDomId(item.id)} aria-current={selected ? "true" : undefined} style={{ "--line": dayIndex === null ? "var(--rail)" : dayColorVar(dayIndex) } as CSSProperties} className={`relative grid min-w-0 scroll-mt-32 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 ${dragging ? "z-10 scale-[1.02] opacity-70" : ""} ${pressing ? "scale-[0.99] transition-transform" : ""} ${dragEnabled ? "touch-pan-y cursor-grab select-none" : ""}`}>
    {/* 노선과 정거장 점. 같은 날의 일정이 하나의 선으로 이어진다. */}
    <div aria-hidden className="line-rail"><i className="line-station" /></div>
    <div className={`mb-3 min-w-0 rounded-xl border bg-card px-3.5 py-3 shadow-[var(--shadow-card)] transition-colors ${selected ? "border-foreground" : "border-border"}`}>
    <div className="flex min-w-0 items-start gap-3">
      {editable && bulkSelection ? <input type="checkbox" checked={bulkSelection.selected.has(item.id)} onChange={() => bulkSelection.toggle(item.id)} aria-label={`${item.title} 선택`} className="mt-1 size-4 shrink-0" /> : null}
      <span aria-hidden className="line-code size-11 shrink-0" style={dayIndex === null ? { background: "var(--muted)", color: "var(--muted-foreground)" } : undefined}><small className="text-[9px] font-semibold tracking-wider opacity-90">{dayIndex === null ? "·" : lineLetter(dayIndex)}</small><b className="mt-0.5 text-[17px] font-semibold">{String(order).padStart(2, "0")}</b></span>
      {item.coordinate ? <button type="button" data-select-item aria-pressed={selected} onClick={() => select(item.id, "timeline")} className="min-w-0 flex-1 rounded text-left"><span className="sr-only">지도에서 보기: </span><ItemBody item={item} timezone={timezone} /></button> : <div className="min-w-0 flex-1"><ItemBody item={item} timezone={timezone} /></div>}
    </div>
    {(previous || next) && <div className="mt-3 space-y-2">
      {previous && <TravelLegView key={legKey(previous.id, item.id)} tripId={tripId} from={previous} to={item} leg={previousLeg} editable={travelEditable} direction="previous" onExpandedChange={setPreviousOpen} />}
      {next && <TravelLegView key={legKey(item.id, next.id)} tripId={tripId} from={item} to={next} leg={nextLeg} editable={travelEditable} direction="next" onExpandedChange={setNextOpen} />}
    </div>}
    {editable ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
      <button type="button" aria-expanded={panel === "move"} aria-label={`${item.title} 순서 이동`} onClick={() => setPanel((value) => (value === "move" ? null : "move"))} className={CONTROL}>{panel === "move" ? "이동 닫기" : "순서·날짜 이동"}</button>
      <button type="button" aria-expanded={panel === "edit"} onClick={() => setPanel((value) => (value === "edit" ? null : "edit"))} className={CONTROL}>{panel === "edit" ? "수정 닫기" : "수정"}</button>
      <button type="button" disabled={deleting} aria-busy={deleting} aria-label={`${item.title} 삭제`} data-testid={`delete-item-${item.id}`} onClick={remove} className={`${CONTROL} text-muted-foreground hover:text-danger`}>{deleting ? "삭제 중…" : "삭제"}</button>
    </div> : null}
    {editable && panel === "move" ? <MoveControls item={item} tripId={tripId} days={days} isFirst={isFirst} isLast={isLast} dateKey={dateKey} /> : null}
    {editable && panel === "edit" ? <ItemEditForm item={item} timezone={timezone} onCancel={() => setPanel(null)} /> : null}
    {message || pending ? <p role="status" className="mt-2 text-xs text-muted-foreground">{pending ? "이동 중…" : message}</p> : null}
    </div>
  </li>;
}
