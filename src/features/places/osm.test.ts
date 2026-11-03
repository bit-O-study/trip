import { afterEach, describe, expect, it, vi } from "vitest";

import { OsmPlaceSearchError, osmCategoryGroup, searchOsmPlaces } from "./osm";

describe("osmCategoryGroup", () => {
  it("OSM 분류를 앱 분류로 옮긴다", () => {
    expect(osmCategoryGroup("amenity", "restaurant")).toBe("food");
    expect(osmCategoryGroup("amenity", "cafe")).toBe("cafe");
    expect(osmCategoryGroup("tourism", "hotel")).toBe("lodging");
    expect(osmCategoryGroup("tourism", "museum")).toBe("attraction");
    expect(osmCategoryGroup("shop", "mall")).toBe("shopping");
    expect(osmCategoryGroup("railway", "station")).toBe("transport");
    expect(osmCategoryGroup("boundary", "administrative")).toBe("etc");
  });
});

describe("searchOsmPlaces", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("결과를 장소로 정규화하고 출처를 provider 와 id 접두사로 남긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { osm_type: "node", osm_id: 123, lat: "25.0339", lon: "121.5645", name: "타이베이 101", display_name: "타이베이 101, 신이구, 타이베이", category: "tourism", type: "attraction" },
        { osm_type: "way", osm_id: 9, lat: "x", lon: "y", display_name: "깨진 좌표" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await searchOsmPlaces({ query: "101", category: "attraction", center: { latitude: 25, longitude: 121.5 } });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      provider: "manual",
      providerPlaceId: "osm:node/123",
      name: "타이베이 101",
      categoryGroup: "attraction",
      latitude: 25.0339,
      longitude: 121.5645,
      url: "https://www.openstreetmap.org/node/123",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("q=101+attraction");
    expect(String(url)).toContain("viewbox=");
    expect(init.headers["User-Agent"]).toMatch(/TripPlanner/);
  });

  it("네트워크 오류와 비정상 응답은 OsmPlaceSearchError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(searchOsmPlaces({ query: "x" })).rejects.toBeInstanceOf(OsmPlaceSearchError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(searchOsmPlaces({ query: "x" })).rejects.toMatchObject({ kind: "provider" });
  });
});
