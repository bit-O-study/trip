import { isDomesticTrip } from "@/features/map/region";

import { GooglePlaceSearchError, searchGooglePlaces } from "./google";
import { CATEGORY_FILTERS, PlaceSearchError, searchPlaces } from "./kakao";
import type { PlaceCategoryGroup, PlaceSearchResponse } from "./types";

/**
 * 장소 검색 공급자 선택.
 *
 * 지도와 **같은 규칙**을 쓴다 (`region.ts`). 지도는 해외 여행이면 Google 로
 * 그리는데 검색만 Kakao 로 남으면, 그려 줄 수는 있어도 찍을 점을 찾을 방법이
 * 없다. 실제로 그래서 해외 여행에 장소를 추가할 수가 없었다.
 *
 * Kakao 는 한국 밖 데이터가 사실상 비어 있고, Google 은 어디든 나오지만
 * 결제 계정이 붙는다. 그래서 국내는 Kakao 로 두어 과금을 0 으로 유지하고
 * Kakao 로 답할 수 없는 여행만 Google 로 보낸다.
 */
export type PlaceSearchProvider = "kakao" | "google";

export function pickPlaceProvider(input: {
  timezone: string | null;
  points: readonly { latitude: number; longitude: number }[];
}): PlaceSearchProvider {
  return isDomesticTrip({ points: input.points, timezone: input.timezone }) ? "kakao" : "google";
}

export type TripPlaceSearchInput = {
  query: string;
  page?: number;
  category?: PlaceCategoryGroup;
  /** 방문 예정일. Google 영업시간으로 "쉬는 날" 을 판정할 때 쓴다. */
  date?: string;
  center?: { latitude: number; longitude: number };
};

/**
 * 공급자를 골라 검색한다.
 *
 * 오류는 `PlaceSearchError` 하나로 모은다. 호출부가 공급자별 오류 타입을 알아야
 * 하면 새 공급자를 붙일 때마다 degraded mode 분기가 갈라진다.
 */
export async function searchPlacesWith(
  provider: PlaceSearchProvider,
  input: TripPlaceSearchInput,
): Promise<PlaceSearchResponse> {
  if (provider === "kakao") {
    return searchPlaces({
      query: input.query,
      page: input.page,
      categoryGroupCode: CATEGORY_FILTERS.find((filter) => filter.group === input.category)?.code,
      center: input.center,
      radiusMeters: input.center ? 50_000 : undefined,
    });
  }

  try {
    return await searchGooglePlaces({
      query: input.query,
      category: input.category,
      date: input.date,
      center: input.center,
    });
  } catch (error) {
    if (error instanceof GooglePlaceSearchError) {
      throw new PlaceSearchError(
        error.message,
        error.kind === "provider" ? "upstream" : error.kind,
      );
    }
    throw new PlaceSearchError(
      `장소 검색 서버에 연결하지 못했습니다: ${(error as Error).message}`,
      "network",
    );
  }
}
