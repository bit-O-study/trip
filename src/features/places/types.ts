/** DB 의 trip.place_category_group 열거형과 1:1 대응한다. */
export const PLACE_CATEGORY_GROUPS = [
  "food",
  "cafe",
  "lodging",
  "attraction",
  "shopping",
  "transport",
  "etc",
] as const;

export type PlaceCategoryGroup = (typeof PLACE_CATEGORY_GROUPS)[number];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategoryGroup, string> = {
  food: "맛집",
  cafe: "카페",
  lodging: "숙소",
  attraction: "명소",
  shopping: "쇼핑",
  transport: "교통",
  etc: "기타",
};

/**
 * Kakao 카테고리 그룹 코드 → 앱 분류.
 *
 * Kakao 가 코드를 추가해도 조용히 깨지지 않도록 모르는 코드는 etc 로 떨어뜨린다.
 * 출처: Kakao Local API 카테고리 그룹 코드
 */
const KAKAO_CATEGORY_GROUP: Record<string, PlaceCategoryGroup> = {
  FD6: "food", // 음식점
  CE7: "cafe", // 카페
  AD5: "lodging", // 숙박
  AT4: "attraction", // 관광명소
  CT1: "attraction", // 문화시설
  MT1: "shopping", // 대형마트
  CS2: "shopping", // 편의점
  SW8: "transport", // 지하철역
  PK6: "transport", // 주차장
  OL7: "transport", // 주유소·충전소
  HP8: "etc", // 병원
  PM9: "etc", // 약국
  BK9: "etc", // 은행
  PO3: "etc", // 공공기관
  SC4: "etc", // 학교
  AC5: "etc", // 학원
  AG2: "etc", // 중개업소
};

export function toCategoryGroup(kakaoCode: string | null | undefined): PlaceCategoryGroup {
  if (!kakaoCode) return "etc";
  return KAKAO_CATEGORY_GROUP[kakaoCode] ?? "etc";
}

/** 검색 결과. 좌표는 이미 WGS84 실수로 정규화된 상태다. */
export type PlaceSearchResult = {
  provider: "google" | "kakao";
  providerPlaceId: string;
  name: string;
  /** 원본 카테고리 문자열 ("음식점 > 일식 > 초밥,롤") */
  category: string | null;
  categoryGroup: PlaceCategoryGroup;
  address: string | null;
  roadAddress: string | null;
  phone: string | null;
  url: string | null;
  latitude: number;
  longitude: number;
  /** Google Places가 제공하는 음식 종류 표시명. */
  cuisineType: string | null;
  googleRating: number | null;
  /** 선택한 날짜의 정기 영업시간 기준. 정보가 없으면 null. */
  closedOnDate: boolean | null;
};

export type PlaceSearchResponse = {
  results: PlaceSearchResult[];
  /** 더 가져올 페이지가 있는지 */
  hasMore: boolean;
  /** 이 검색어로 도달 가능한 총 건수 (Kakao 는 최대 45) */
  reachableCount: number;
  /** 실제로 존재하는 전체 건수. 45보다 클 수 있다 */
  totalCount: number;
};
