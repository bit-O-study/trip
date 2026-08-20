import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

const LOAD_TIMEOUT_MS = 10_000;

let configuredKey: string | null = null;
export type GoogleMapsLibraries = google.maps.MapsLibrary & google.maps.CoreLibrary;

let loadPromise: Promise<GoogleMapsLibraries> | null = null;

export class MapLoadError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "network" | "timeout",
  ) {
    super(message);
    this.name = "MapLoadError";
  }
}

export function loadGoogleMaps(apiKey: string | undefined): Promise<GoogleMapsLibraries> {
  if (!apiKey) {
    return Promise.reject(
      new MapLoadError(
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY가 없어 지도를 불러올 수 없습니다.",
        "not_configured",
      ),
    );
  }

  if (loadPromise) return loadPromise;

  if (!configuredKey) {
    setOptions({
      key: apiKey,
      v: "weekly",
      language: "ko",
      region: "KR",
      authReferrerPolicy: "origin",
    });
    configuredKey = apiKey;
  }

  loadPromise = Promise.race([
    Promise.all([
      importLibrary("maps") as Promise<google.maps.MapsLibrary>,
      importLibrary("core") as Promise<google.maps.CoreLibrary>,
    ]).then(([maps, core]) => ({ ...maps, ...core })),
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new MapLoadError("지도를 불러오는 데 너무 오래 걸립니다.", "timeout")),
        LOAD_TIMEOUT_MS,
      );
    }),
  ]).catch((error: unknown) => {
    loadPromise = null;
    if (error instanceof MapLoadError) throw error;
    throw new MapLoadError(
      error instanceof Error ? error.message : "Google Maps를 불러오지 못했습니다.",
      "network",
    );
  });

  return loadPromise;
}
