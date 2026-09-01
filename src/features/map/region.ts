/**
 * 지도 공급자를 국내/해외로 가른다.
 *
 * Kakao 는 무료 쿼터가 넉넉하지만 한국 밖은 지도가 비어 있다시피 하고, Google 은
 * 어디든 나오지만 결제 계정이 붙어야 한다. 그래서 국내 여행은 Kakao, 해외 여행만
 * Google 로 보내 과금 대상을 실제로 필요한 경우로 좁힌다.
 *
 * 판정은 좌표가 우선이다. 여행 이름이나 목적지 문자열은 자유 입력이라 믿을 수
 * 없고, 정작 지도가 감당해야 하는 것은 화면에 찍히는 좌표다. 한 점이라도 한국
 * 밖이면 Kakao 로는 그 점을 보여 줄 수 없으므로 해외로 본다.
 */
import type { MapPoint } from "./types";

/**
 * 남한 본토의 거친 윤곽. `[경도, 위도]` 순서다.
 *
 * 사각형으로는 안 된다 — 위도·경도만 잘라내면 쓰시마(34.4N/129.3E)와
 * 후쿠오카(33.6N/130.4E)가 그대로 "국내" 로 들어온다. 규슈는 제주보다 북쪽까지
 * 올라오고 쓰시마는 부산 남서쪽에 있어서, 두 나라를 가르려면 최소한 남해안을
 * 따라가는 선이 필요하다.
 *
 * 정밀한 국경이 목적이 아니다. 이 값이 답하는 질문은 "이 점을 Kakao 지도로
 * 보여 줄 수 있는가" 이고, 그래서 해안선은 넉넉하게 바깥으로 잡았다.
 */
const MAINLAND: readonly (readonly [number, number])[] = [
  [126.0, 37.7], // 강화 서쪽
  [126.6, 38.3], // 임진강 북
  [127.5, 38.35],
  [128.4, 38.62], // 고성
  [129.15, 38.2],
  [129.6, 37.1], // 동해안
  [129.6, 36.0],
  [129.5, 35.4],
  [129.35, 35.05], // 부산 동쪽
  [128.9, 34.85], // 거제 남
  [128.3, 34.6],
  [127.8, 34.25], // 여수 남
  [127.2, 34.1],
  [126.5, 34.05], // 해남 남
  [126.05, 34.3], // 진도 서
  [126.0, 35.0],
  [126.2, 35.6],
  [126.3, 36.4],
  [126.1, 36.9], // 태안
  [126.35, 37.4], // 인천
];

/**
 * 본토 윤곽 밖에 있는 섬들. 각각 `[최소경도, 최소위도, 최대경도, 최대위도]`.
 *
 * 섬까지 다각형에 욱여넣으면 선이 일본 쪽으로 끌려간다. 서로 떨어진 덩어리는
 * 따로 두는 편이 읽기도 고치기도 쉽다.
 */
const ISLAND_BOXES: readonly (readonly [number, number, number, number])[] = [
  [125.95, 32.95, 127.05, 33.75], // 제주 · 마라도 · 우도
  [130.7, 37.15, 132.0, 37.75], // 울릉도 · 독도
  [124.45, 36.8, 126.15, 38.15], // 백령 · 대청 · 연평 등 서해 5도
  [124.9, 33.7, 126.6, 34.9], // 신안 · 흑산 · 가거도 · 추자
];

/** 반직선 교차법. 경계에 걸친 점은 어느 쪽으로 가도 상관없다. */
function isInPolygon(lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = MAINLAND.length - 1; i < MAINLAND.length; j = i++) {
    const [xi, yi] = MAINLAND[i];
    const [xj, yj] = MAINLAND[j];
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function isInKorea(point: { latitude: number; longitude: number }): boolean {
  const { latitude: lat, longitude: lng } = point;
  if (isInPolygon(lng, lat)) return true;
  return ISLAND_BOXES.some(
    ([minLng, minLat, maxLng, maxLat]) =>
      lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat,
  );
}

/**
 * 좌표가 하나도 없는 새 여행은 시간대로 정한다. 아직 아무것도 안 찍힌 지도는
 * 어느 쪽이든 비어 있지만, 국내 여행에서 굳이 과금 대상인 Google 을 띄울
 * 이유가 없다.
 */
export function isDomesticTrip(input: {
  points: readonly Pick<MapPoint, "latitude" | "longitude">[];
  timezone?: string | null;
}): boolean {
  if (input.points.length > 0) return input.points.every(isInKorea);
  return input.timezone === "Asia/Seoul";
}
