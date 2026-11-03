/**
 * Day 색상 팔레트.
 *
 * 타임라인과 지도 마커가 같은 색을 공유해야 "Day 2의 세 번째 방문지"를
 * 두 화면에서 같은 것으로 인식할 수 있다. 색 정의가 두 군데로 갈라지면
 * 반드시 어긋나므로 여기 한 곳에서만 관리한다.
 * CSS 변수는 globals.css의 --day-1 ~ --day-8 과 1:1 대응한다.
 *
 * 쨍한 원색은 쓰지 않는다. 흰 글자를 올려도 읽히는 중간 명도의 차분한 색이고,
 * 서로의 구별은 채도가 아니라 색상·명도 차이로 한다.
 */
export const DAY_COLOR_COUNT = 8;

export const DAY_COLORS = [
  "#4f7399",
  "#3f8070",
  "#6e7f3e",
  "#a5703c",
  "#7b6a9c",
  "#94566f",
  "#3f7c8c",
  "#5f6b7a",
] as const;

export type DayColor = (typeof DAY_COLORS)[number];

/**
 * 0-based day index에 대응하는 색상 HEX를 반환한다.
 *
 * 8일을 넘는 여행은 색이 순환한다. 8일 이상 여행에서 같은 색이 재등장하는 것은
 * 의도된 동작이다 — 색을 무한히 늘리면 서로 구별되지 않아 오히려 못 알아본다.
 * 대신 마커의 방문 순번(①②③)으로 구분한다.
 *
 * 음수나 정수가 아닌 값은 0번으로 처리한다. 데이터 오류로 UI가 깨지는 것보다
 * 색 하나가 틀리는 편이 낫기 때문이다.
 */
export function dayColor(dayIndex: number): DayColor {
  if (!Number.isFinite(dayIndex)) return DAY_COLORS[0];
  const normalized = Math.trunc(dayIndex) % DAY_COLOR_COUNT;
  const index = normalized < 0 ? normalized + DAY_COLOR_COUNT : normalized;
  return DAY_COLORS[index];
}

/**
 * Tailwind 유틸리티에서 쓸 CSS 변수 이름을 반환한다.
 * 예: dayColorVar(0) === "var(--day-1)"
 */
export function dayColorVar(dayIndex: number): string {
  if (!Number.isFinite(dayIndex)) return "var(--day-1)";
  const normalized = Math.trunc(dayIndex) % DAY_COLOR_COUNT;
  const index = normalized < 0 ? normalized + DAY_COLOR_COUNT : normalized;
  return `var(--day-${index + 1})`;
}

/**
 * 노선 코드 문자. Day 1 → B, Day 2 → T … 순서는 팔레트와 같다.
 * 정거장 번호 배지("B01")에 쓴다.
 */
const LINE_LETTERS = ["B", "T", "O", "C", "L", "M", "S", "G"] as const;

export function lineLetter(dayIndex: number): string {
  if (!Number.isFinite(dayIndex)) return LINE_LETTERS[0];
  const normalized = Math.trunc(dayIndex) % DAY_COLOR_COUNT;
  const index = normalized < 0 ? normalized + DAY_COLOR_COUNT : normalized;
  return LINE_LETTERS[index];
}
