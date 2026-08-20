/**
 * Kakao Maps JS SDK 로더.
 *
 * SDK 는 브라우저에서만 동작하고 JavaScript 키가 노출된다. 노출 자체는 전제이고,
 * Kakao 콘솔의 **플랫폼 도메인 화이트리스트**가 유일한 실질적 보호 장치다.
 *
 * 로드가 실패하거나 늦어지면 지도 없이도 앱을 쓸 수 있어야 한다. 그래서 이
 * 로더는 예외를 던지고, 화면은 목록 전용으로 폴백한다.
 */

type KakaoLatLng = { getLat(): number; getLng(): number };

type KakaoBounds = { extend(latlng: KakaoLatLng): void; isEmpty(): boolean };

export type KakaoMap = {
  setCenter(latlng: KakaoLatLng): void;
  /** 부드럽게 이동. 선택한 항목을 따라갈 때 순간이동보다 위치 감각이 유지된다. */
  panTo(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
  setBounds(bounds: KakaoBounds, ...padding: number[]): void;
  relayout(): void;
};

export type KakaoOverlay = { setMap(map: KakaoMap | null): void };

export type KakaoMaps = {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement | string;
    yAnchor?: number;
    zIndex?: number;
    clickable?: boolean;
  }) => KakaoOverlay;
  Polyline: new (options: {
    path: KakaoLatLng[];
    strokeWeight?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
  }) => KakaoOverlay;
};

declare global {
  interface Window {
    kakao?: { maps?: KakaoMaps };
  }
}

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";
const LOAD_TIMEOUT_MS = 10_000;

let loadPromise: Promise<KakaoMaps> | null = null;

export class MapLoadError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "network" | "timeout",
  ) {
    super(message);
    this.name = "MapLoadError";
  }
}

export function loadKakaoMaps(appKey: string | undefined): Promise<KakaoMaps> {
  if (!appKey) {
    return Promise.reject(
      new MapLoadError(
        "NEXT_PUBLIC_KAKAO_JS_KEY 가 없어 지도를 불러올 수 없습니다.",
        "not_configured",
      ),
    );
  }

  // 이미 로드됐으면 그대로 쓴다.
  const existing = window.kakao?.maps;
  if (existing && typeof existing.Map === "function") {
    return Promise.resolve(existing);
  }

  // 여러 지도 컴포넌트가 동시에 마운트돼도 스크립트는 한 번만 넣는다.
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    // autoload=false 여야 kakao.maps.load() 로 준비 시점을 제어할 수 있다.
    script.src = `${SDK_URL}?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;

    const timer = window.setTimeout(() => {
      cleanup();
      loadPromise = null;
      reject(new MapLoadError("지도를 불러오는 데 너무 오래 걸립니다.", "timeout"));
    }, LOAD_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }

    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        cleanup();
        loadPromise = null;
        reject(new MapLoadError("지도 SDK 를 초기화하지 못했습니다.", "network"));
        return;
      }
      maps.load(() => {
        cleanup();
        resolve(maps);
      });
    };

    script.onerror = () => {
      cleanup();
      // 다음 시도에서 다시 붙일 수 있도록 캐시를 비운다.
      loadPromise = null;
      script.remove();
      reject(
        new MapLoadError(
          "지도를 불러오지 못했습니다. 네트워크나 Kakao 도메인 등록을 확인하세요.",
          "network",
        ),
      );
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

/** 테스트·재시도용 */
export function resetKakaoMapsLoader() {
  loadPromise = null;
}
