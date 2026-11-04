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

  const respond = (items: unknown[]) => ({ ok: true, json: async () => items });

  it("결과를 장소로 정규화하고 출처를 provider 와 id 접두사로 남긴다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond([
      { osm_type: "node", osm_id: 123, lat: "25.0339", lon: "121.5645", name: "타이베이 101", display_name: "타이베이 101, 신이구, 타이베이", category: "tourism", type: "attraction" },
      { osm_type: "way", osm_id: 9, lat: "x", lon: "y", display_name: "깨진 좌표" },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await searchOsmPlaces({ query: "101", center: { latitude: 25, longitude: 121.5 } });
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
    expect(String(url)).toContain("viewbox=");
    expect(init.headers["User-Agent"]).toMatch(/TripPlanner/);
  });

  it("분류를 검색어에 덧붙이지 않는다(덧붙이면 '스린 야시장' 이 0건이 된다)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond([]));
    vi.stubGlobal("fetch", fetchMock);
    await searchOsmPlaces({ query: "스린 야시장", category: "food" });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("q")).toBe("스린 야시장");
  });

  it("0건이면 띄어쓰기를 지워 한 번 더 찾는다", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond([{ osm_type: "node", osm_id: 5, lat: "25.04", lon: "121.51", name: "타이베이역", category: "railway", type: "station" }]));
    vi.stubGlobal("fetch", fetchMock);
    const response = await searchOsmPlaces({ query: "타이베이 역" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("q")).toBe("타이베이역");
    expect(response.results[0].name).toBe("타이베이역");
  });

  it("고른 분류와 맞는 결과를 앞으로 보내되 나머지도 남긴다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond([
      { osm_type: "node", osm_id: 1, lat: "25", lon: "121", name: "역", category: "railway", type: "station" },
      { osm_type: "node", osm_id: 2, lat: "25", lon: "121", name: "식당", category: "amenity", type: "restaurant" },
    ])));
    const response = await searchOsmPlaces({ query: "x", category: "food" });
    expect(response.results.map((place) => place.name)).toEqual(["식당", "역"]);
  });

  it("네트워크 오류와 비정상 응답은 OsmPlaceSearchError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(searchOsmPlaces({ query: "x" })).rejects.toBeInstanceOf(OsmPlaceSearchError);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(searchOsmPlaces({ query: "x" })).rejects.toMatchObject({ kind: "provider" });
  });
});
