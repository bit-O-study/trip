import type { ItineraryItem } from "@/features/trips/types";
import { zonedDateKey, zonedLocalToUtc, zonedTimeLabel } from "@/lib/datetime";

/**
 * 일정 순서 이동 계획.
 *
 * 타임라인의 표시 순서는 `(start_at, sort_order)` 다. sort_order 는 **같은 시각**
 * 항목들의 동점을 깰 뿐이므로, sort_order 만 바꾸면 시각이 다른 두 항목의 위아래는
 * 절대 바뀌지 않는다. 그래서 "위로 이동"은 시각도 함께 옮겨야 한다 — 이웃의
 * 시각을 그대로 넘겨받고, sort_order 로 그 이웃보다 앞/뒤에 선다.
 *
 * 사용자 입장에서도 이 편이 정직하다. 10:00 항목을 12:00 항목 위로 올리면서
 * 시각을 12:00 그대로 두면 "시간순 타임라인"이라는 약속이 깨진다.
 *
 * 여기서는 계획만 세우고, 실제 sort_order 계산과 쓰기는 `trip.move_item` 이
 * 한 번의 원자적 호출로 처리한다 (읽고-계산하고-쓰는 사이의 경쟁 방지).
 */
export type MovePlan = {
  /** 새 시작 시각 (UTC ISO). `trip.move_item` 의 p_start_at */
  startAt: string;
  /** 이 항목 바로 뒤에 놓는다. null 이면 그 날짜의 맨 앞 */
  afterItemId: string | null;
};

/** ISO 문자열 비교는 표기가 달라질 수 있어 (`+00:00` vs `Z`) 항상 수치로 한다. */
function epoch(iso: string): number {
  return Date.parse(iso);
}

/**
 * 같은 날짜(여행 시간대 기준)의 항목들을 표시 순서대로.
 * `items` 는 `listItems` 가 준 `(start_at, sort_order)` 정렬을 그대로 유지한다.
 */
function siblingsOf(items: ItineraryItem[], dateKey: string, timezone: string): ItineraryItem[] {
  return items.filter((item) => zonedDateKey(item.startAt, timezone) === dateKey);
}

/** 위로 한 칸. 맨 위이거나 항목이 없으면 null — 호출부는 무시하면 된다. */
export function planMoveUp(
  items: ItineraryItem[],
  itemId: string,
  timezone: string,
): MovePlan | null {
  const target = items.find((item) => item.id === itemId);
  if (!target) return null;

  const siblings = siblingsOf(items, zonedDateKey(target.startAt, timezone), timezone);
  const index = siblings.findIndex((item) => item.id === itemId);
  if (index <= 0) return null;

  const previous = siblings[index - 1];
  // 이전 항목의 앞에 서려면 그 앞 항목을 기준으로 삼는다.
  const anchor = index >= 2 ? siblings[index - 2].id : null;
  return { startAt: previous.startAt, afterItemId: anchor };
}

/** 아래로 한 칸. 맨 아래면 null. */
export function planMoveDown(
  items: ItineraryItem[],
  itemId: string,
  timezone: string,
): MovePlan | null {
  const target = items.find((item) => item.id === itemId);
  if (!target) return null;

  const siblings = siblingsOf(items, zonedDateKey(target.startAt, timezone), timezone);
  const index = siblings.findIndex((item) => item.id === itemId);
  if (index < 0 || index >= siblings.length - 1) return null;

  const next = siblings[index + 1];
  return { startAt: next.startAt, afterItemId: next.id };
}

/**
 * 다른 날짜로 옮긴다. 벽시계 시각은 유지한다 — "14:00 점심"은 날짜가 바뀌어도
 * 14:00 이어야 한다. UTC 오프셋을 그대로 더하면 시차가 있는 여행에서 시각이 밀린다.
 *
 * 옮겨 간 날짜 안에서는 시각에 맞는 자리에 끼워 넣는다. 맨 앞에 던져 두면
 * 같은 시각 항목들 사이에서 순서가 뒤집혀 보인다.
 */
export function planMoveToDay(
  items: ItineraryItem[],
  itemId: string,
  targetDate: string,
  timezone: string,
): MovePlan | null {
  const target = items.find((item) => item.id === itemId);
  if (!target) return null;

  const currentDate = zonedDateKey(target.startAt, timezone);
  if (currentDate === targetDate) return null;

  const startAt = zonedLocalToUtc(
    `${targetDate}T${zonedTimeLabel(target.startAt, timezone)}`,
    timezone,
  );

  // 옮긴 뒤의 날짜가 요청한 날짜와 어긋나면(DST 경계 등) 계획을 세우지 않는다.
  // move_item 은 p_start_at 으로 날짜를 판정하므로 조용히 엉뚱한 날에 놓인다.
  if (zonedDateKey(startAt, timezone) !== targetDate) return null;

  const siblings = siblingsOf(items, targetDate, timezone).filter((item) => item.id !== itemId);
  const at = epoch(startAt);

  let anchor: string | null = null;
  for (const sibling of siblings) {
    if (epoch(sibling.startAt) <= at) anchor = sibling.id;
    else break;
  }

  return { startAt, afterItemId: anchor };
}
