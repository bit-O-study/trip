import { describe, expect, it } from "vitest";

import { isDomesticTrip, isInKorea } from "@/features/map/region";

function point(latitude: number, longitude: number) {
  return { latitude, longitude };
}

describe("국내/해외 지도 공급자 판정", () => {
  it("본토와 부속 섬을 국내로 본다", () => {
    expect(isInKorea(point(37.5665, 126.978))).toBe(true); // 서울시청
    expect(isInKorea(point(35.1796, 129.0756))).toBe(true); // 부산
    expect(isInKorea(point(38.2044, 128.5912))).toBe(true); // 속초
    expect(isInKorea(point(33.1113, 126.2683))).toBe(true); // 마라도
    expect(isInKorea(point(37.9614, 124.6303))).toBe(true); // 백령도
    expect(isInKorea(point(37.2429, 131.8664))).toBe(true); // 독도
    expect(isInKorea(point(34.0776, 125.1154))).toBe(true); // 가거도
  });

  it("사각형으로는 갈라지지 않는 가까운 일본을 해외로 본다", () => {
    // 규슈는 제주보다 북쪽까지 올라오고 쓰시마는 부산 남서쪽에 있다.
    // 위경도 범위만 자르면 둘 다 "국내" 로 들어와 Kakao 지도에 안 나온다.
    expect(isInKorea(point(33.5904, 130.4017))).toBe(false); // 후쿠오카
    expect(isInKorea(point(34.4028, 129.3286))).toBe(false); // 쓰시마
    expect(isInKorea(point(35.6762, 139.6503))).toBe(false); // 도쿄
    expect(isInKorea(point(31.2304, 121.4737))).toBe(false); // 상하이
  });

  it("좌표가 하나라도 한국 밖이면 해외로 본다", () => {
    // 한 점이라도 Kakao 지도에 못 찍히면 그 여행은 Kakao 로 그릴 수 없다.
    expect(
      isDomesticTrip({
        points: [point(37.5665, 126.978), point(35.6762, 139.6503)],
        timezone: "Asia/Seoul",
      }),
    ).toBe(false);
  });

  it("좌표가 모두 국내면 시간대와 무관하게 국내로 본다", () => {
    expect(
      isDomesticTrip({
        points: [point(37.5665, 126.978), point(35.1796, 129.0756)],
        timezone: "Asia/Tokyo",
      }),
    ).toBe(true);
  });

  it("좌표가 없는 새 여행은 시간대로 정한다", () => {
    expect(isDomesticTrip({ points: [], timezone: "Asia/Seoul" })).toBe(true);
    expect(isDomesticTrip({ points: [], timezone: "Asia/Tokyo" })).toBe(false);
    // 시간대를 모르면 과금 대상이 아닌 쪽으로 기울지 않는다 - 해외 여행에서
    // 빈 Kakao 지도를 보여 주는 것보다 Google 로 여는 편이 덜 틀린다.
    expect(isDomesticTrip({ points: [] })).toBe(false);
  });
});
