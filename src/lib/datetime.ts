/**
 * 시간대 처리.
 *
 * 규칙은 하나다 — 저장은 UTC(`timestamptz`), 표시는 여행 시간대.
 * 여행앱 버그의 상당수가 이 경계를 흐리는 데서 나온다.
 *
 * 특히 "이 항목이 며칠 것인가"는 반드시 여행 시간대로 판정해야 한다.
 * DB 쪽 `trip_private.item_day()` 와 같은 규칙이어야 하며, 어긋나면
 * 타임라인과 저장된 순서가 서로 다른 날을 가리킨다.
 */

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-02-14" 형태의 날짜 문자열인지 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function partsInZone(iso: string | Date, timeZone: string) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) {
    throw new Error(`올바르지 않은 시각입니다: ${String(iso)}`);
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return parts;
}

/**
 * 해당 시간대에서의 날짜 키 ("2026-02-15").
 *
 * DB 의 `(start_at at time zone tz)::date` 와 같은 결과를 내야 한다.
 * 예: 2026-02-14T16:00Z 는 UTC 로는 14일이지만 Asia/Tokyo 에서는 15일이다.
 */
export function zonedDateKey(iso: string | Date, timeZone: string): string {
  const parts = partsInZone(iso, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** 해당 시간대에서의 시각 라벨 ("08:20"). 24시간 표기. */
export function zonedTimeLabel(iso: string | Date, timeZone: string): string {
  const parts = partsInZone(iso, timeZone);
  // Intl 은 자정을 "24" 로 주는 경우가 있다.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${hour}:${parts.minute}`;
}

/** 해당 시각에서 그 시간대의 UTC 오프셋(ms). Asia/Seoul 이면 +9h. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = partsInZone(date, timeZone);
  // 그 시간대의 벽시계 시각을 UTC 로 읽었다고 가정하고 실제 UTC 와의 차를 본다.
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
  );
  // 초 단위는 버리고 비교하므로 원본도 분 단위로 맞춘다.
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return asIfUtc - truncated;
}

/**
 * 여행 시간대의 로컬 입력("2026-02-14T08:20")을 UTC ISO 문자열로 바꾼다.
 *
 * JS 에는 "특정 시간대의 벽시계 시각을 파싱" 하는 기능이 없다. 오프셋을 구해
 * 역산하되, DST 전환 구간에서는 추정한 순간의 오프셋이 달라질 수 있으므로
 * 한 번 더 보정한다. 보정하지 않으면 봄/가을 전환일에 한 시간이 어긋난다.
 */
export function zonedLocalToUtc(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error(`로컬 시각 형식이 올바르지 않습니다: ${local}`);
  }

  const asUtc = Date.parse(`${local}:00Z`);
  if (Number.isNaN(asUtc)) {
    throw new Error(`시각을 해석할 수 없습니다: ${local}`);
  }

  const firstGuess = asUtc - zoneOffsetMs(new Date(asUtc), timeZone);
  const refined = asUtc - zoneOffsetMs(new Date(firstGuess), timeZone);

  return new Date(refined).toISOString();
}

/** UTC ISO 를 여행 시간대의 로컬 입력값으로 되돌린다. 폼 초기값에 쓴다. */
export function utcToZonedLocal(iso: string | Date, timeZone: string): string {
  return `${zonedDateKey(iso, timeZone)}T${zonedTimeLabel(iso, timeZone)}`;
}

export type TripDay = {
  /** 0-based */
  index: number;
  /** "2026-02-14" */
  date: string;
  /** "일" ~ "토" */
  weekday: string;
  /** "2/14" */
  shortLabel: string;
};

/**
 * 여행 기간을 날짜 목록으로 편다.
 *
 * `start_date`/`end_date` 는 `date` 컬럼이라 시간대가 없다. 그래서 여기서는
 * 시간대를 쓰지 않고 순수한 날짜 산술만 한다. `new Date("2026-02-14")` 를
 * 만든 뒤 `getDate()` 로 읽으면 실행 환경의 시간대에 따라 하루가 밀리므로
 * UTC 기준으로만 계산한다.
 */
export function tripDays(startDate: string, endDate: string): TripDay[] {
  if (!DATE_ONLY.test(startDate) || !DATE_ONLY.test(endDate)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${startDate} ~ ${endDate}`);
  }

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error(`날짜를 해석할 수 없습니다: ${startDate} ~ ${endDate}`);
  }
  // 끝이 시작보다 이르면 빈 목록. 여기서 예외를 던지면 잘못 저장된 여행 하나가
  // 목록 화면 전체를 깨뜨린다.
  if (end < start) return [];

  const dayMs = 24 * 60 * 60 * 1000;
  const count = Math.round((end - start) / dayMs) + 1;

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * dayMs);
    const iso = date.toISOString().slice(0, 10);
    return {
      index,
      date: iso,
      weekday: WEEKDAYS_KO[date.getUTCDay()],
      shortLabel: `${date.getUTCMonth() + 1}/${date.getUTCDate()}`,
    };
  });
}

/** 여행 기간의 일수. 1박2일이면 2. */
export function tripDayCount(startDate: string, endDate: string): number {
  return tripDays(startDate, endDate).length;
}

/** "4박5일" 같은 라벨. 당일치기는 "당일". */
export function tripDurationLabel(startDate: string, endDate: string): string {
  const days = tripDayCount(startDate, endDate);
  if (days <= 0) return "";
  if (days === 1) return "당일";
  return `${days - 1}박${days}일`;
}
