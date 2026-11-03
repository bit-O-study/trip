import { utcToZonedLocal } from "@/lib/datetime";

/**
 * 새 투표의 기본 시각(여행 시간대의 벽시계 값).
 *
 * 평소에는 식사 12:00, 투표 마감 10:00 이다. 그런데 기본 날짜가 오늘이고 이미 마감 시각이
 * 지났다면 만들자마자 "이미 지났습니다" 로 실패한다. 그때는 지금 이후로 당겨서 첫 제출이
 * 통과하게 한다.
 */
export function pollDefaults(date: string, timezone: string, now: Date = new Date()) {
  const base = { scheduledLocal: `${date}T12:00`, closesLocal: `${date}T10:00` };
  const nowLocal = utcToZonedLocal(now.toISOString(), timezone);
  if (nowLocal.slice(0, 10) !== date) return base;

  const [hours, minutes] = nowLocal.slice(11, 16).split(":").map(Number);
  const nowMinutes = hours * 60 + minutes;
  // 마감 기본(10:00)까지 한 시간 넘게 남았으면 그대로 둔다.
  if (nowMinutes + 60 <= 10 * 60) return base;

  const closes = Math.ceil((nowMinutes + 60) / 30) * 30;
  const scheduled = Math.max(closes + 90, 12 * 60);
  // 하루가 거의 끝났으면 어느 값도 그날 안에 둘 수 없다. 사용자가 날짜를 고르게 둔다.
  if (scheduled >= 24 * 60) return base;
  const format = (total: number) => `${date}T${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return { scheduledLocal: format(scheduled), closesLocal: format(closes) };
}
