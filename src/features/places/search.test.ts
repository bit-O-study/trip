import { beforeEach, describe, expect, it, vi } from "vitest";

import { GooglePlaceSearchError } from "@/features/places/google";
import { PlaceSearchError } from "@/features/places/kakao";
import { pickPlaceProvider, searchPlacesWith } from "@/features/places/search";

const mocks = vi.hoisted(() => ({ searchKakao: vi.fn(), searchGoogle: vi.fn() }));

vi.mock("@/features/places/kakao", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/places/kakao")>()),
  searchPlaces: mocks.searchKakao,
}));
vi.mock("@/features/places/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/places/google")>()),
  searchGooglePlaces: mocks.searchGoogle,
}));

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const TOKYO = { latitude: 35.6895, longitude: 139.6917 };

describe("pickPlaceProvider", () => {
  it("좌표가 없는 국내 여행은 Kakao 로 검색한다", () => {
    expect(pickPlaceProvider({ timezone: "Asia/Seoul", points: [] })).toBe("kakao");
  });

  it("좌표가 없는 해외 여행은 Google 로 검색한다", () => {
    expect(pickPlaceProvider({ timezone: "Asia/Tokyo", points: [] })).toBe("google");
  });

  /*
   * 검색과 지도는 같은 답을 내야 한다. 시간대가 Asia/Seoul 이어도 이미 해외
   * 좌표가 찍혀 있으면 지도는 Google 이다. 검색만 Kakao 로 남으면 찾은 장소를
   * 그 지도에 올릴 수 없다.
   */
  it("한국 밖 좌표가 하나라도 있으면 Google 로 넘어간다", () => {
    expect(pickPlaceProvider({ timezone: "Asia/Seoul", points: [SEOUL, TOKYO] })).toBe("google");
  });

  it("좌표가 모두 국내면 Kakao 를 유지한다", () => {
    expect(pickPlaceProvider({ timezone: "Asia/Tokyo", points: [SEOUL] })).toBe("kakao");
  });
});

describe("searchPlacesWith", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Kakao 카테고리 필터를 공급자 코드로 옮긴다", async () => {
    mocks.searchKakao.mockResolvedValue({ results: [] });
    await searchPlacesWith("kakao", { query: "라멘", category: "cafe" });
    expect(mocks.searchKakao).toHaveBeenCalledWith(
      expect.objectContaining({ query: "라멘", categoryGroupCode: "CE7" }),
    );
  });

  it("Google 에는 방문 예정일을 넘겨 휴무를 판정하게 한다", async () => {
    mocks.searchGoogle.mockResolvedValue({ results: [] });
    await searchPlacesWith("google", { query: "ichiran", date: "2026-02-14" });
    expect(mocks.searchGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ query: "ichiran", date: "2026-02-14" }),
    );
  });

  // 호출부가 공급자별 오류 타입을 알아야 하면 degraded mode 분기가 갈라진다.
  it("Google 오류를 PlaceSearchError 로 모은다", async () => {
    mocks.searchGoogle.mockRejectedValue(new GooglePlaceSearchError("한도 초과", "quota"));
    await expect(searchPlacesWith("google", { query: "x" })).rejects.toMatchObject({
      name: "PlaceSearchError",
      kind: "quota",
    });
  });

  it("공급자 오류는 upstream 으로 옮긴다", async () => {
    mocks.searchGoogle.mockRejectedValue(new GooglePlaceSearchError("500", "provider"));
    const caught = await searchPlacesWith("google", { query: "x" }).catch((error) => error);
    expect(caught).toBeInstanceOf(PlaceSearchError);
    expect(caught.kind).toBe("upstream");
  });
});
