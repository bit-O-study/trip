import type { PlaceCategoryGroup, PlaceSearchResponse, PlaceSearchResult } from "./types";

type GooglePeriod = { open?: { day?: number } };
type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  rating?: number;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: { periods?: GooglePeriod[] };
};

const INCLUDED_TYPE: Partial<Record<PlaceCategoryGroup, string>> = {
  food: "restaurant",
  cafe: "cafe",
  lodging: "lodging",
  attraction: "tourist_attraction",
};

function toCategoryGroup(place: GooglePlace): PlaceCategoryGroup {
  const types = new Set([place.primaryType, ...(place.types ?? [])]);
  if (types.has("restaurant") || types.has("food")) return "food";
  if (types.has("cafe") || types.has("coffee_shop")) return "cafe";
  if (types.has("lodging") || types.has("hotel")) return "lodging";
  if (types.has("tourist_attraction") || types.has("museum")) return "attraction";
  if (types.has("shopping_mall") || types.has("store")) return "shopping";
  if (types.has("airport") || types.has("transit_station")) return "transport";
  return "etc";
}

function isClosedOnDate(periods: GooglePeriod[] | undefined, date: string | undefined) {
  if (!periods || !date) return null;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return !periods.some((period) => period.open?.day === weekday);
}

export class GooglePlaceSearchError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "quota" | "provider",
  ) {
    super(message);
  }
}

export async function searchGooglePlaces(input: {
  query: string;
  category?: PlaceCategoryGroup;
  date?: string;
  center?: { latitude: number; longitude: number };
}): Promise<PlaceSearchResponse> {
  const key = process.env.GOOGLE_PLACES_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new GooglePlaceSearchError(
      "GOOGLE_PLACES_API_KEY가 없어 Google 장소 검색을 사용할 수 없습니다.",
      "not_configured",
    );
  }

  const requestBody: Record<string, unknown> = {
    textQuery: input.query,
    languageCode: "ko",
    maxResultCount: 20,
  };
  const includedType = input.category ? INCLUDED_TYPE[input.category] : undefined;
  if (includedType) requestBody.includedType = includedType;
  if (input.center) {
    requestBody.locationBias = {
      circle: { center: input.center, radius: 50_000 },
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryType",
        "places.primaryTypeDisplayName",
        "places.types",
        "places.rating",
        "places.googleMapsUri",
        "places.nationalPhoneNumber",
        "places.regularOpeningHours.periods",
      ].join(","),
    },
    body: JSON.stringify(requestBody),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    const kind = response.status === 429 ? "quota" : response.status === 403 ? "not_configured" : "provider";
    throw new GooglePlaceSearchError(
      kind === "not_configured"
        ? "Google Places API(New)가 사용 설정되지 않았거나 API 키 제한이 맞지 않습니다."
        : `Google 장소 검색에 실패했습니다 (${response.status}): ${detail.slice(0, 160)}`,
      kind,
    );
  }

  const payload = (await response.json()) as { places?: GooglePlace[] };
  const results = (payload.places ?? []).flatMap((place): PlaceSearchResult[] => {
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!place.id || !place.displayName?.text || latitude === undefined || longitude === undefined) return [];
    const categoryGroup = toCategoryGroup(place);
    return [{
      provider: "google",
      providerPlaceId: place.id,
      name: place.displayName.text,
      category: place.primaryTypeDisplayName?.text ?? place.primaryType ?? null,
      categoryGroup,
      cuisineType: place.primaryTypeDisplayName?.text ?? (categoryGroup === "food" ? "음식점" : null),
      googleRating: place.rating ?? null,
      closedOnDate: isClosedOnDate(place.regularOpeningHours?.periods, input.date),
      address: place.formattedAddress ?? null,
      roadAddress: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber ?? null,
      url: place.googleMapsUri ?? null,
      latitude,
      longitude,
    }];
  });

  return { results, hasMore: false, reachableCount: results.length, totalCount: results.length };
}
