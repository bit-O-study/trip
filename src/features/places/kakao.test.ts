import { describe, expect, it } from "vitest";

import {
  MAX_PAGE,
  MAX_REACHABLE,
  normalizeDocument,
  normalizeSearchBody,
  type KakaoDocument,
} from "@/features/places/kakao";
import { toCategoryGroup } from "@/features/places/types";

/**
 * 실제 Kakao Local API 응답에서 그대로 가져온 문서.
 * 2026-08-20, query="홍대 맛집"
 */
const REAL_DOCUMENT: KakaoDocument = {
  address_name: "서울 마포구 서교동 363-24",
  category_group_code: "FD6",
  category_group_name: "음식점",
  category_name: "음식점 > 일식 > 초밥,롤",
  distance: "",
  id: "27253757",
  phone: "02-325-8717",
  place_name: "여우골 홍대점",
  place_url: "http://place.map.kakao.com/27253757",
  road_address_name: "서울 마포구 와우산로19길 9",
  x: "126.922634627821",
  y: "37.5511360518077",
} as KakaoDocument;

describe("normalizeDocument", () => {
  it("실제 응답을 앱 표준 형태로 바꾼다", () => {
    expect(normalizeDocument(REAL_DOCUMENT)).toEqual({
      provider: "kakao",
      providerPlaceId: "27253757",
      name: "여우골 홍대점",
      category: "음식점 > 일식 > 초밥,롤",
      categoryGroup: "food",
      address: "서울 마포구 서교동 363-24",
      roadAddress: "서울 마포구 와우산로19길 9",
      phone: "02-325-8717",
      url: "http://place.map.kakao.com/27253757",
      latitude: 37.5511360518077,
      longitude: 126.922634627821,
      cuisineType: "초밥,롤",
      googleRating: null,
      closedOnDate: null,
    });
  });

  it("x 를 경도로, y 를 위도로 읽는다", () => {
    // 뒤집으면 서울(위도 37, 경도 127)이 좌표계를 벗어나거나 엉뚱한 곳으로 간다.
    // 이 앱에서 가장 조용히 틀리기 쉬운 지점이라 별도로 고정한다.
    const result = normalizeDocument(REAL_DOCUMENT);
    expect(result?.latitude).toBeCloseTo(37.55, 2);
    expect(result?.longitude).toBeCloseTo(126.92, 2);
    expect(result!.longitude).toBeGreaterThan(result!.latitude);
  });

  it("좌표가 문자열이 아니거나 숫자가 아니면 버린다", () => {
    expect(normalizeDocument({ ...REAL_DOCUMENT, x: "", y: "" })).toBeNull();
    expect(normalizeDocument({ ...REAL_DOCUMENT, x: "abc", y: "37.5" })).toBeNull();
  });

  it("좌표 범위를 벗어나면 버린다", () => {
    expect(normalizeDocument({ ...REAL_DOCUMENT, y: "91" })).toBeNull();
    expect(normalizeDocument({ ...REAL_DOCUMENT, x: "181" })).toBeNull();
  });

  it("id 나 이름이 비면 버린다", () => {
    expect(normalizeDocument({ ...REAL_DOCUMENT, id: "" })).toBeNull();
    expect(normalizeDocument({ ...REAL_DOCUMENT, place_name: "   " })).toBeNull();
  });

  it("빈 문자열 필드는 null 로 만든다", () => {
    const result = normalizeDocument({
      ...REAL_DOCUMENT,
      phone: "",
      road_address_name: "",
    });
    expect(result?.phone).toBeNull();
    expect(result?.roadAddress).toBeNull();
  });
});

describe("toCategoryGroup", () => {
  it.each([
    ["FD6", "food"],
    ["CE7", "cafe"],
    ["AD5", "lodging"],
    ["AT4", "attraction"],
    ["CT1", "attraction"],
    ["MT1", "shopping"],
    ["SW8", "transport"],
  ])("%s → %s", (code, expected) => {
    expect(toCategoryGroup(code)).toBe(expected);
  });

  it("모르는 코드와 빈 값은 etc 로 떨어뜨린다", () => {
    // Kakao 가 코드를 추가해도 조용히 깨지면 안 된다.
    expect(toCategoryGroup("ZZ9")).toBe("etc");
    expect(toCategoryGroup("")).toBe("etc");
    expect(toCategoryGroup(null)).toBe("etc");
  });
});

describe("normalizeSearchBody", () => {
  function body(overrides: Partial<{ is_end: boolean; pageable_count: number; total_count: number }>) {
    return {
      documents: [REAL_DOCUMENT],
      meta: {
        is_end: false,
        pageable_count: 45,
        total_count: 6376,
        ...overrides,
      },
    };
  }

  it("도달 가능 건수를 45로 자른다", () => {
    // pageable_count 가 45를 넘게 오더라도 실제로 가져올 수 있는 건 45건이다.
    const result = normalizeSearchBody(body({ pageable_count: 900 }), 1);
    expect(result.reachableCount).toBe(MAX_REACHABLE);
    expect(result.totalCount).toBe(6376);
  });

  it("is_end 를 신뢰해 더 요청할지 정한다", () => {
    // 페이지 번호만 보고 계속 요청하면 4페이지부터 같은 문서를 다시 받는다.
    expect(normalizeSearchBody(body({ is_end: false }), 1).hasMore).toBe(true);
    expect(normalizeSearchBody(body({ is_end: true }), 1).hasMore).toBe(false);
  });

  it("마지막 페이지를 넘어서면 더 없다고 한다", () => {
    expect(normalizeSearchBody(body({ is_end: false }), MAX_PAGE).hasMore).toBe(false);
  });

  it("좌표가 깨진 문서는 결과에서 빠진다", () => {
    const mixed = {
      documents: [REAL_DOCUMENT, { ...REAL_DOCUMENT, id: "2", x: "", y: "" }],
      meta: { is_end: true, pageable_count: 2, total_count: 2 },
    };
    const result = normalizeSearchBody(mixed, 1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].providerPlaceId).toBe("27253757");
  });
});
