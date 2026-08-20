import {
  toCategoryGroup,
  type PlaceCategoryGroup,
  type PlaceSearchResponse,
  type PlaceSearchResult,
} from "@/features/places/types";

/**
 * Kakao Local API 키워드 장소 검색.
 *
 * 반드시 서버에서만 호출한다. REST 키는 브라우저에 나가면 안 된다.
 */

const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";

/** 한 페이지 최대 건수 (Kakao 상한) */
export const PAGE_SIZE = 15;

/**
 * 도달 가능한 최대 건수.
 *
 * Kakao 문서는 page 를 1~45 로 적고 있지만 실제로는 `meta.is_end` 가 3페이지에서
 * true 가 되고, 4페이지 이후는 앞 페이지와 같은 문서를 되돌려준다.
 * 즉 실질 상한은 45페이지가 아니라 **45건**이다. (2026-08-20 실측)
 */
export const MAX_REACHABLE = 45;
export const MAX_PAGE = MAX_REACHABLE / PAGE_SIZE;

export type KakaoDocument = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
  place_url: string;
  distance?: string;
};

export type KakaoSearchBody = {
  documents: KakaoDocument[];
  meta: {
    is_end: boolean;
    pageable_count: number;
    total_count: number;
  };
};

function trimOrNull(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * 좌표 문자열을 수치로 바꾼다. 읽을 수 없으면 null.
 *
 * `Number("")` 는 NaN 이 아니라 **0** 이다. 그래서 Number.isFinite 만으로는
 * 빈 좌표를 걸러내지 못하고 위도 0·경도 0 인 장소가 만들어진다.
 * 빈 문자열을 먼저 걸러야 한다.
 */
function parseCoordinate(raw: string | undefined | null): number | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Kakao 문서 하나를 앱 표준 형태로 바꾼다.
 *
 * 좌표를 못 읽으면 null 을 돌려 호출자가 버리게 한다. NaN 을 그대로 저장하면
 * 지도에서 조용히 사라지거나 엉뚱한 곳에 찍힌다.
 */
export function normalizeDocument(doc: KakaoDocument): PlaceSearchResult | null {
  // ⚠ Kakao 는 x 가 경도(longitude), y 가 위도(latitude)다. 뒤집으면
  // 한국 좌표가 중국 근처로 간다. 문자열로 오므로 수치 변환도 필요하다.
  const longitude = parseCoordinate(doc.x);
  const latitude = parseCoordinate(doc.y);

  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  // 정확히 (0, 0) 은 좌표가 비어 있을 때 생기는 값이다. 실제 장소가 있을 수
  // 없는 바다 한가운데이므로 데이터 오류로 본다.
  if (latitude === 0 && longitude === 0) return null;

  const id = trimOrNull(doc.id);
  const name = trimOrNull(doc.place_name);
  if (!id || !name) return null;

  return {
    provider: "kakao",
    providerPlaceId: id,
    name,
    category: trimOrNull(doc.category_name),
    categoryGroup: toCategoryGroup(doc.category_group_code),
    address: trimOrNull(doc.address_name),
    roadAddress: trimOrNull(doc.road_address_name),
    phone: trimOrNull(doc.phone),
    url: trimOrNull(doc.place_url),
    latitude,
    longitude,
    cuisineType: doc.category_name?.split(" > ").at(-1) ?? null,
    googleRating: null,
    closedOnDate: null,
  };
}

export function normalizeSearchBody(body: KakaoSearchBody, page: number): PlaceSearchResponse {
  const results = body.documents
    .map(normalizeDocument)
    .filter((result): result is PlaceSearchResult => result !== null);

  const reachableCount = Math.min(body.meta.pageable_count, MAX_REACHABLE);

  return {
    results,
    // is_end 를 신뢰한다. 페이지 번호만 보고 더 요청하면 중복을 받는다.
    hasMore: !body.meta.is_end && page < MAX_PAGE,
    reachableCount,
    totalCount: body.meta.total_count,
  };
}

export class PlaceSearchError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "rate_limited" | "quota" | "upstream" | "network",
  ) {
    super(message);
    this.name = "PlaceSearchError";
  }
}

export type SearchOptions = {
  query: string;
  page?: number;
  categoryGroupCode?: string;
  /** 중심 좌표를 주면 그 주변을 우선한다. */
  center?: { latitude: number; longitude: number };
  radiusMeters?: number;
};

export async function searchPlaces(options: SearchOptions): Promise<PlaceSearchResponse> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    throw new PlaceSearchError(
      "KAKAO_REST_API_KEY 가 없습니다. 장소 검색을 사용할 수 없습니다.",
      "not_configured",
    );
  }

  const page = Math.min(Math.max(options.page ?? 1, 1), MAX_PAGE);

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", options.query);
  url.searchParams.set("size", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  if (options.categoryGroupCode) {
    url.searchParams.set("category_group_code", options.categoryGroupCode);
  }
  if (options.center) {
    // 여기서도 x 가 경도다.
    url.searchParams.set("x", String(options.center.longitude));
    url.searchParams.set("y", String(options.center.latitude));
    if (options.radiusMeters) url.searchParams.set("radius", String(options.radiusMeters));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      /*
       * 같은 검색어를 반복 조회해도 쿼터를 소모하지 않도록 캐시한다.
       * 장소 정보는 하루 단위로 바뀌어도 충분하다.
       */
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    throw new PlaceSearchError(
      `장소 검색 서버에 연결하지 못했습니다: ${(error as Error).message}`,
      "network",
    );
  }

  if (!response.ok) {
    // 429 는 쿼터/속도 제한. 사용자에게는 "잠시 후" 라고 알려야 한다.
    if (response.status === 429) {
      throw new PlaceSearchError("장소 검색 요청이 많습니다. 잠시 후 다시 시도하세요.", "quota");
    }
    const detail = await response.text().catch(() => "");
    throw new PlaceSearchError(
      `장소 검색에 실패했습니다 (${response.status}): ${detail.slice(0, 200)}`,
      "upstream",
    );
  }

  const body = (await response.json()) as KakaoSearchBody;
  return normalizeSearchBody(body, page);
}

/** UI 필터용. Kakao 코드로 되돌린다. */
export const CATEGORY_FILTERS: { group: PlaceCategoryGroup; code: string; label: string }[] = [
  { group: "food", code: "FD6", label: "맛집" },
  { group: "cafe", code: "CE7", label: "카페" },
  { group: "lodging", code: "AD5", label: "숙소" },
  { group: "attraction", code: "AT4", label: "명소" },
];
