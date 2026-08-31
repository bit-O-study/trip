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
});
