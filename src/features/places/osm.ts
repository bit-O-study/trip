import type { PlaceCategoryGroup, PlaceSearchResponse, PlaceSearchResult } from "./types";

/**
 * OpenStreetMap(Nominatim) 장소 검색. 키·결제가 필요 없다.
 *
 * Google Places 는 결제 계정이 있어야 하고 Kakao 는 한국 밖 데이터가 비어 있다. 둘 다 못 쓰는
 * 해외 여행에서 장소를 아예 추가할 수 없게 되지 않도록 마지막 수단으로 둔다.
 * 영업시간·평점은 없고 상호가 현지어일 수 있다. 사용 정책(초당 1건 이하, 식별 가능한 User-Agent)상
 * 서버에서만 부르고, 호출 쪽의 속도 제한(route.ts)이 그 한도를 지킨다.
 * https://operations.osmfoundation.org/policies/nominatim/
 */
const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "TripPlanner/1.0 (https://trip.helthssu.co.kr)";

type NominatimItem = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  category?: string;
  type?: string;
  addresstype?: string;
};

export class OsmPlaceSearchError extends Error {
  constructor(message: string, readonly kind: "network" | "provider") {
    super(message);
  }
}

/** OSM 의 category/type 을 앱 분류로. 모르는 값은 etc. */
export function osmCategoryGroup(category: string | undefined, type: string | undefined): PlaceCategoryGroup {
  const key = `${category ?? ""}:${type ?? ""}`;
  if (/^amenity:(restaurant|fast_food|food_court|bar|pub|biergarten|ice_cream)$/.test(key)) return "food";
  if (/^amenity:cafe$/.test(key)) return "cafe";
  if (/^tourism:(hotel|hostel|guest_house|motel|apartment|chalet)$/.test(key)) return "lodging";
  if (/^tourism:(attraction|museum|gallery|viewpoint|zoo|theme_park|aquarium|artwork)$/.test(key) || /^(historic|leisure|natural):/.test(key)) return "attraction";
  if (/^shop:/.test(key) || /^amenity:marketplace$/.test(key)) return "shopping";
  if (/^(railway|aeroway|public_transport):/.test(key) || /^amenity:(bus_station|ferry_terminal)$/.test(key)) return "transport";
  return "etc";
}

const CATEGORY_QUERY: Partial<Record<PlaceCategoryGroup, string>> = {
  food: "restaurant",
  cafe: "cafe",
  lodging: "hotel",
  attraction: "attraction",
};

export async function searchOsmPlaces(input: {
  query: string;
  category?: PlaceCategoryGroup;
  center?: { latitude: number; longitude: number };
}): Promise<PlaceSearchResponse> {
  const params = new URLSearchParams({
    q: input.query,
    format: "jsonv2",
    limit: "12",
    addressdetails: "0",
    "accept-language": "ko,en,zh",
  });
  // 분류를 고르면 검색어에 덧붙여 결과를 좁힌다. Nominatim 은 분류 필터가 없다.
  const hint = input.category ? CATEGORY_QUERY[input.category] : undefined;
  if (hint) params.set("q", `${input.query} ${hint}`);
  if (input.center) {
    const { latitude: lat, longitude: lon } = input.center;
    // 중심 주변을 우선한다. bounded 는 쓰지 않는다 — 구역 밖 정답을 잘라 버린다.
    params.set("viewbox", `${lon - 0.6},${lat + 0.6},${lon + 0.6},${lat - 0.6}`);
  }

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}?${params}`, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ko,en;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new OsmPlaceSearchError("무료 장소 검색 서버에 연결하지 못했습니다.", "network");
  }
  if (!response.ok) throw new OsmPlaceSearchError("무료 장소 검색을 일시적으로 이용할 수 없습니다.", "provider");

  const items = (await response.json()) as NominatimItem[];
  const results = (Array.isArray(items) ? items : []).flatMap((item): PlaceSearchResult[] => {
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!item.osm_type || !item.osm_id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const display = item.display_name ?? "";
    const name = item.name || display.split(",")[0]?.trim() || "이름 없는 장소";
    return [{
      // DB 의 장소 공급자 값 가운데 상용 공급자가 아닌 것은 'manual' 뿐이라 그것을 쓴다(마이그레이션 없이 저장된다).
      // 출처는 providerPlaceId 의 "osm:" 접두사로 남는다.
      provider: "manual",
      providerPlaceId: `osm:${item.osm_type}/${item.osm_id}`,
      name,
      category: item.type ? item.type.replace(/_/g, " ") : null,
      categoryGroup: osmCategoryGroup(item.category, item.type),
      cuisineType: null,
      googleRating: null,
      closedOnDate: null,
      address: display || null,
      roadAddress: null,
      phone: null,
      url: `https://www.openstreetmap.org/${item.osm_type}/${item.osm_id}`,
      latitude,
      longitude,
    }];
  });

  return { results, hasMore: false, reachableCount: results.length, totalCount: results.length };
}
