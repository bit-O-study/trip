import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/datetime";

/**
 * 여행 시간대를 바꿀 때 "현지 시각 유지" 를 고른 경우의 계산.
 *
 * 저장값은 UTC 라 시간대만 바꾸면 10:00 일정이 다른 시각으로 보인다. 옛 시간대의
 * 벽시계 시각을 새 시간대의 같은 벽시계 시각으로 다시 읽어 UTC 를 새로 만든다.
 */
export type ShiftableItem = {
  id: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string | null;
};

export type WallClockUpdate = {
  id: string;
  previousStartAt: string;
  startAt: string;
  endAt: string | null;
};

/**
 * 옮길 항목과 새 값.
 *
 * - 항공편은 공항 현지 시각으로 저장된 **실제 시각**이다. 여행 시간대와 무관하므로 그대로 둔다.
 * - 투표 후보(candidate)는 투표의 일정 시각과 짝이라 그대로 둔다.
 * - 값이 그대로인 항목은 쓰지 않는다.
 */
export function planWallClockShift(
  items: readonly ShiftableItem[],
  fromTimezone: string,
  toTimezone: string,
): WallClockUpdate[] {
  if (fromTimezone === toTimezone) return [];
  const shift = (iso: string) => zonedLocalToUtc(utcToZonedLocal(iso, fromTimezone), toTimezone);

  const updates: WallClockUpdate[] = [];
  for (const item of items) {
    if (item.type === "flight" || item.status === "candidate") continue;
    const startAt = shift(item.startAt);
    let endAt = item.endAt ? shift(item.endAt) : null;
    // 새 시간대의 DST 공백 때문에 시작이 밀려 종료보다 늦어지면 길이 0 으로 맞춘다.
    if (endAt && Date.parse(endAt) < Date.parse(startAt)) endAt = startAt;
    if (Date.parse(startAt) === Date.parse(item.startAt)) continue;
    updates.push({ id: item.id, previousStartAt: item.startAt, startAt, endAt });
  }
  return updates;
}
