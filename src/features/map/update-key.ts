import type { MapPoint } from "./types";

/** 순서·제목 변경은 지도의 확대 범위를 바꿀 이유가 없다. */
export function mapGeometryKey(points: readonly MapPoint[]) {
  return JSON.stringify(points.map((p) => [p.id, p.latitude, p.longitude]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

/** RSC 새 응답의 배열 참조가 달라도 지도 내용이 같으면 재생성하지 않는다. */
export function mapContentKey(points: readonly MapPoint[]) {
  return JSON.stringify(points.map((p) => [p.id, p.latitude, p.longitude, p.title, p.dayIndex, p.order, p.kind, p.badgeLabel, p.warning]));
}
