import { describe, expect, it } from "vitest";
import { mapContentKey, mapGeometryKey } from "./update-key";
import type { MapPoint } from "./types";

const point: MapPoint = { id: "one", title: "숙소", latitude: 37.5, longitude: 127, dayIndex: 0, order: 1 };
describe("지도 갱신 기준", () => {
  it("동일 데이터의 새 참조로 마커를 다시 만들지 않는다", () => {
    expect(mapContentKey([point])).toBe(mapContentKey([{ ...point }]));
  });
  it("제목·방문 순서 변경은 마커만 바꾸고 확대 범위는 유지한다", () => {
    const changed = { ...point, title: "새 이름", order: 2 };
    expect(mapContentKey([point])).not.toBe(mapContentKey([changed]));
    expect(mapGeometryKey([point])).toBe(mapGeometryKey([changed]));
  });
  it("위치·추가·삭제는 범위를 갱신한다", () => {
    expect(mapGeometryKey([point])).not.toBe(mapGeometryKey([{ ...point, latitude: 35 }]));
    expect(mapGeometryKey([point])).not.toBe(mapGeometryKey([]));
  });
});
