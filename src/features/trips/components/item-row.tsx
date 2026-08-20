"use client";

import {
  deleteItemAction,
  moveItemDownAction,
  moveItemToDayAction,
  moveItemUpAction,
} from "@/features/trips/actions";
import { timelineItemDomId, useItemSelection } from "@/features/trips/components/trip-board";
import { ITEM_TYPE_ICONS, ITEM_TYPE_LABELS, type ItineraryItem } from "@/features/trips/types";
import { dayColorVar } from "@/lib/day-color";
import { zonedTimeLabel } from "@/lib/datetime";

export type DayOption = { date: string; label: string };

type Props = {
  item: ItineraryItem;
  /** 그 날의 방문 순번 (1-based). 지도 마커의 숫자와 같아야 한다. */
  order: number;
  /** 0-based. 여행 기간 밖 항목은 null — 색을 줄 Day 가 없다. */
  dayIndex: number | null;
  timezone: string;
  tripId: string;
  editable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** 날짜 이동 대상. 여행 기간의 모든 날. */
  dayOptions: DayOption[];
  /** 현재 날짜 (여행 시간대 기준 "2026-02-14") */
  currentDate: string;
};

const CONTROL =
  "rounded-lg border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 항목 본문.
 *
 * 좌표가 있으면 button 으로 감싸 지도와 연결한다. button 안에는 phrasing content
 * 만 들어갈 수 있으므로 p 가 아니라 span 을 쓴다.
 */
function ItemBody({ item, timezone }: { item: ItineraryItem; timezone: string }) {
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}
        </span>
        <span className="truncate font-medium">
          <span aria-hidden>{ITEM_TYPE_ICONS[item.type]}</span>{" "}
          <span className="sr-only">{ITEM_TYPE_LABELS[item.type]}</span>
          {item.title}
        </span>
      </span>
      {item.locationText ? (
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {item.locationText}
        </span>
      ) : null}
      {item.note ? (
        <span className="mt-1 block whitespace-pre-wrap text-sm text-muted-foreground">
          {item.note}
        </span>
      ) : null}
    </>
  );
}

export function ItemRow({
  item,
  order,
  dayIndex,
  timezone,
  tripId,
  editable,
  canMoveUp,
  canMoveDown,
  dayOptions,
  currentDate,
}: Props) {
  const { selectedId, select } = useItemSelection();
  const selected = selectedId === item.id;
  const mappable = item.coordinate !== null;

  return (
    <li
      id={timelineItemDomId(item.id)}
      aria-current={selected ? "true" : undefined}
      className={`scroll-mt-32 rounded-lg border bg-card px-4 py-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-foreground"
          /* 지도 마커와 같은 Day 색. 기간 밖 항목은 색을 줄 Day 가 없다. */
          style={
            dayIndex === null
              ? { background: "var(--muted)", color: "var(--muted-foreground)" }
              : { background: dayColorVar(dayIndex) }
          }
        >
          {order}
        </span>

        {mappable ? (
          <button
            type="button"
            data-select-item
            aria-pressed={selected}
            onClick={() => select(item.id, "timeline")}
            className="min-w-0 flex-1 rounded text-left"
          >
            <span className="sr-only">지도에서 보기: </span>
            <ItemBody item={item} timezone={timezone} />
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <ItemBody item={item} timezone={timezone} />
          </div>
        )}
      </div>

      {editable ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          {/*
            드래그가 없어도 순서를 바꿀 수 있어야 한다. 드래그를 붙이더라도
            이 버튼들은 남는다 — 키보드·보조기술 사용자의 유일한 경로다.
          */}
          <form action={moveItemUpAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="tripId" value={tripId} />
            <button
              type="submit"
              disabled={!canMoveUp}
              aria-label={`${item.title} 위로 이동`}
              className={CONTROL}
            >
              <span aria-hidden>↑</span> 위로
            </button>
          </form>

          <form action={moveItemDownAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="tripId" value={tripId} />
            <button
              type="submit"
              disabled={!canMoveDown}
              aria-label={`${item.title} 아래로 이동`}
              className={CONTROL}
            >
              <span aria-hidden>↓</span> 아래로
            </button>
          </form>

          {dayOptions.length > 1 ? (
            <form action={moveItemToDayAction} className="flex items-center gap-1.5">
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="tripId" value={tripId} />
              <label className="sr-only" htmlFor={`move-day-${item.id}`}>
                {item.title} 날짜 변경
              </label>
              {/*
                onChange 로 자동 제출하지 않는다. 키보드로 select 를 넘길 때마다
                change 가 발생해 원하지 않는 날로 옮겨진다.
              */}
              <select
                id={`move-day-${item.id}`}
                name="date"
                defaultValue={currentDate}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                {dayOptions.some((option) => option.date === currentDate) ? null : (
                  <option value={currentDate}>기간 밖 · {currentDate}</option>
                )}
                {dayOptions.map((option) => (
                  <option key={option.date} value={option.date}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button type="submit" className={CONTROL}>
                날짜 이동
              </button>
            </form>
          ) : null}

          <form action={deleteItemAction} className="ml-auto">
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="tripId" value={tripId} />
            <button
              type="submit"
              aria-label={`${item.title} 삭제`}
              className={`${CONTROL} text-muted-foreground hover:text-danger`}
            >
              삭제
            </button>
          </form>
        </div>
      ) : null}
    </li>
  );
}
