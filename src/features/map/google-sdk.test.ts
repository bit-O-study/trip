import { beforeEach, describe, expect, it, vi } from "vitest";

const loader = vi.hoisted(() => ({
  importLibrary: vi.fn(),
  setOptions: vi.fn(),
}));

vi.mock("@googlemaps/js-api-loader", () => loader);

describe("Google Maps SDK loader", () => {
  beforeEach(() => {
    vi.resetModules();
    loader.importLibrary.mockReset();
    loader.setOptions.mockReset();
  });

  it("API 키가 없으면 지도 대신 명확한 설정 오류를 반환한다", async () => {
    const { loadGoogleMaps } = await import("@/features/map/google-sdk");

    await expect(loadGoogleMaps(undefined)).rejects.toMatchObject({
      kind: "not_configured",
    });
    expect(loader.importLibrary).not.toHaveBeenCalled();
  });

  it("지도와 core 라이브러리를 로드하고 키를 브라우저 로더에 설정한다", async () => {
    loader.importLibrary
      .mockResolvedValueOnce({ Map: class Map {} })
      .mockResolvedValueOnce({ LatLng: class LatLng {} });
    const { loadGoogleMaps } = await import("@/features/map/google-sdk");

    await expect(loadGoogleMaps("browser-key")).resolves.toMatchObject({
      Map: expect.any(Function),
      LatLng: expect.any(Function),
    });
    expect(loader.setOptions).toHaveBeenCalledWith({
      key: "browser-key",
      v: "weekly",
      language: "ko",
      region: "KR",
    });
    expect(loader.importLibrary).toHaveBeenCalledWith("maps");
    expect(loader.importLibrary).toHaveBeenCalledWith("core");
  });

  it("인증 실패(결제 미연결 등)를 구독자에게 알린다", async () => {
    loader.importLibrary
      .mockResolvedValueOnce({ Map: class Map {} })
      .mockResolvedValueOnce({ LatLng: class LatLng {} });
    const { loadGoogleMaps, onMapAuthFailure } = await import("@/features/map/google-sdk");
    await loadGoogleMaps("browser-key");

    const seen = vi.fn();
    const unsubscribe = onMapAuthFailure(seen);
    expect(seen).not.toHaveBeenCalled();

    // SDK 는 타일 인증이 막히면 이 전역만 호출한다. 원인 이름은 콘솔로만 나간다.
    window.gm_authFailure?.();
    expect(seen).toHaveBeenCalledTimes(1);

    // 늦게 붙은 구독자도 이미 실패한 사실을 알아야 한다.
    const late = vi.fn();
    onMapAuthFailure(late);
    expect(late).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.gm_authFailure?.();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("결제 미연결처럼 gm_authFailure 가 불리지 않는 실패는 콘솔 오류로 잡는다", async () => {
    // 로더가 감싸는 대상은 설치 시점의 console.error 다. 먼저 걸어 둬야
    // 원본이 그대로 불리는지까지 확인할 수 있다.
    const passthrough = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      loader.importLibrary
        .mockResolvedValueOnce({ Map: class Map {} })
        .mockResolvedValueOnce({ LatLng: class LatLng {} });
      const { loadGoogleMaps, onMapAuthFailure } = await import("@/features/map/google-sdk");
      await loadGoogleMaps("browser-key");

      const seen = vi.fn();
      onMapAuthFailure(seen);

      // SDK 가 실제로 찍는 형태 그대로. 원인 이름은 지역화되지 않는다.
      console.error(
        "Google Maps JavaScript API error: BillingNotEnabledMapError",
        "https://developers.google.com/maps/documentation/javascript/error-messages",
      );

      expect(seen).toHaveBeenCalledWith("BillingNotEnabledMapError");
      // 원본은 그대로 불려야 한다. 삼키면 콘솔에서 원인이 사라진다.
      expect(passthrough).toHaveBeenCalledTimes(1);

      // 지도와 무관한 오류까지 인증 실패로 넘기면 안 된다.
      const late = vi.fn();
      onMapAuthFailure(late);
      expect(late).toHaveBeenCalledWith("BillingNotEnabledMapError");
    } finally {
      passthrough.mockRestore();
    }
  });

  it("지도와 무관한 콘솔 오류는 인증 실패로 보지 않는다", async () => {
    const passthrough = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      loader.importLibrary
        .mockResolvedValueOnce({ Map: class Map {} })
        .mockResolvedValueOnce({ LatLng: class LatLng {} });
      const { loadGoogleMaps, onMapAuthFailure } = await import("@/features/map/google-sdk");
      await loadGoogleMaps("browser-key");

      const seen = vi.fn();
      onMapAuthFailure(seen);
      console.error("Warning: something else went wrong");

      expect(seen).not.toHaveBeenCalled();
      expect(passthrough).toHaveBeenCalledTimes(1);
    } finally {
      passthrough.mockRestore();
    }
  });
});
