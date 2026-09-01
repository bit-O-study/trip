import { dayColor } from "@/lib/day-color";

import type { MapPoint } from "./types";

/**
 * 마커는 `button` 이다. 지도 위 클릭만 되는 요소를 만들면 키보드 사용자에게는
 * 지도가 통째로 사라진다. Kakao 는 CustomOverlay 의 clickable, Google 은
 * overlayMouseTarget 페인에 붙여야 DOM 이벤트가 지도에 먹히지 않고 버튼까지
 * 도달한다.
 *
 * 마커 DOM 은 공급자와 무관하다 — 좌표를 화면 픽셀로 옮기는 방식만 다르다.
 * 그래서 여기서 한 번 만들고 공급자 컴포넌트가 각자 붙인다.
 */
export function markerButton(
  point: MapPoint,
  onSelect: (id: string) => void,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.pointId = point.id;
  if (point.badgeLabel) {
    const label = document.createElement("span");
    label.textContent = point.badgeLabel;
    el.appendChild(label);
    if (point.warning) {
      const warning = document.createElement("span");
      warning.textContent = point.warning;
      warning.style.cssText =
        "display:block;margin-top:2px;font-size:10px;font-weight:700;color:#dc2626";
      el.appendChild(warning);
    }
  } else {
    el.textContent = String(point.order);
  }
  el.setAttribute("aria-label", `${point.order}번째 일정 ${point.title}`);
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    point.badgeLabel ? "width:auto" : "width:26px",
    point.badgeLabel ? "height:auto" : "height:26px",
    point.badgeLabel ? "padding:5px 8px" : "padding:0",
    "cursor:pointer",
    point.badgeLabel ? "border-radius:8px" : "border-radius:9999px",
    "border:2px solid #fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.35)",
    "font:600 12px/1 system-ui,sans-serif",
    point.badgeLabel ? "color:#111827" : "color:#fff",
    "transition:transform .12s ease, box-shadow .12s ease",
    `background:${point.badgeLabel ? "#fff" : dayColor(point.dayIndex)}`,
  ].join(";");
  el.addEventListener("click", () => onSelect(point.id));
  return el;
}

/**
 * 선택된 마커를 키운다. 색은 Day 를 뜻하므로 바꾸지 않고 크기·테두리로만 구분한다.
 *
 * `baseTransform` 은 공급자마다 다르다. Google 오버레이는 좌표를 left/top 에
 * 넣으므로 요소를 스스로 절반씩 당겨야 하고, Kakao CustomOverlay 는 이미
 * 중심에 맞춰 붙여 준다. 이걸 섞으면 선택할 때마다 마커가 한 칸씩 밀린다.
 */
export function applyMarkerSelection(el: HTMLElement, selected: boolean, baseTransform = "") {
  const scale = selected ? "scale(1.45)" : "scale(1)";
  el.setAttribute("aria-pressed", String(selected));
  el.style.transform = baseTransform ? `${baseTransform} ${scale}` : scale;
  el.style.boxShadow = selected
    ? "0 0 0 4px rgba(37,99,235,.45), 0 2px 8px rgba(0,0,0,.4)"
    : "0 1px 4px rgba(0,0,0,.35)";
  el.style.zIndex = selected ? "999" : "";
}

/**
 * 같은 Day 안에서만 선을 잇는다.
 *
 * 이 선은 "방문 순서 연결선"이지 실제 이동 경로가 아니다. 길찾기를 붙이기
 * 전까지는 직선이므로 점선으로 그려 경로선과 구분한다.
 */
export function groupByDay(points: readonly MapPoint[]): Map<number, MapPoint[]> {
  const byDay = new Map<number, MapPoint[]>();
  for (const point of points) {
    const list = byDay.get(point.dayIndex);
    if (list) list.push(point);
    else byDay.set(point.dayIndex, [point]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.order - b.order);
  return byDay;
}
