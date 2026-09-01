import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

import { MapLoadError } from "./errors";

const LOAD_TIMEOUT_MS = 10_000;

let configuredKey: string | null = null;
export type GoogleMapsLibraries = google.maps.MapsLibrary & google.maps.CoreLibrary;

let loadPromise: Promise<GoogleMapsLibraries> | null = null;

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

/*
 * 인증 실패는 "로드 실패" 로 잡히지 않는다.
 *
 * 결제 미연결(BillingNotEnabledMapError), API 미사용(ApiNotActivatedMapError),
 * 도메인 미등록(RefererNotAllowedMapError) 은 모두 부트스트랩 스크립트가 200 으로
 * 내려오고 importLibrary 도 정상 resolve 한다. 실패는 타일을 받을 때 드러나고,
 * 지도 자리에는 Google 자체 오버레이만 남는다.
 *
 * 감지 경로를 콘솔로 잡는 이유는 다른 두 방법이 실제로 안 통했기 때문이다.
 *
 * - 문서화된 window.gm_authFailure 는 모든 실패에서 불리지 않는다. 결제 미연결
 *   에서는 호출되지 않는 것을 브라우저로 확인했다.
 * - 오버레이 DOM 을 뒤지는 방법도 확인해 봤지만 지금 SDK 에는 gm-err-* 클래스가
 *   없고 남는 건 지역화된 문구뿐이라 언어가 바뀌면 깨진다.
 *
 * 남는 안정적인 신호는 콘솔 메시지다. 오류 이름은 Google 이 문서에 목록으로
 * 공개하고 지역화하지 않는다. 그래서 console.error 를 지켜보되 원본은 항상
 * 그대로 호출한다 — 삼키면 콘솔에서 원인이 사라진다.
 */
type AuthFailureListener = (errorName: string | null) => void;
const authFailureListeners = new Set<AuthFailureListener>();
let authFailure: { errorName: string | null } | null = null;

const AUTH_ERROR_PATTERN = /Google Maps JavaScript API (?:error|warning): (\w+)/;

function reportAuthFailure(errorName: string | null) {
  // 같은 실패가 콘솔과 콜백 양쪽으로 오기도 한다. 먼저 온 것만 쓴다.
  if (authFailure) return;
  authFailure = { errorName };
  for (const listener of authFailureListeners) listener(errorName);
}

/** 인증 실패를 구독한다. 이미 실패한 뒤에 붙어도 즉시 알려 준다. */
export function onMapAuthFailure(listener: AuthFailureListener): () => void {
  if (authFailure) listener(authFailure.errorName);
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

let watchingConsole = false;

function watchAuthFailures() {
  if (typeof window === "undefined") return;

  window.gm_authFailure = () => reportAuthFailure(null);

  if (watchingConsole) return;
  watchingConsole = true;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    original.apply(console, args);
    const match = args.map(String).join(" ").match(AUTH_ERROR_PATTERN);
    if (match) reportAuthFailure(match[1]);
  };
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
    // 감시는 SDK 를 넣기 전에 건다. 실패 메시지는 첫 타일 요청과 함께 나온다.
    watchAuthFailures();
    setOptions({
      key: apiKey,
      v: "weekly",
      language: "ko",
      region: "KR",
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
