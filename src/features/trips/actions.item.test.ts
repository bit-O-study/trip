import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceSearchError } from "@/features/places/kakao";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  getTrip: vi.fn(),
  searchPlaces: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/trips/queries", () => ({
  getTrip: mocks.getTrip,
  listItems: vi.fn(),
}));
vi.mock("@/features/places/kakao", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/places/kakao")>()),
  searchPlaces: mocks.searchPlaces,
}));

const TRIP_ID = "00000000-0000-4000-8000-000000000010";

const KAKAO_HIT = {
  provider: "kakao",
  providerPlaceId: "1234",
  name: "이치란 신주쿠",
  latitude: 35.69,
  longitude: 139.7,
};

function insertClient() {
  const insert = vi.fn().mockResolvedValue({ error: null });
  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      rpc: vi.fn().mockResolvedValue({ data: 1000, error: null }),
      from: vi.fn().mockReturnValue({ insert }),
    },
    insert,
  };
}

function itemForm(locationText: string) {
  const form = new FormData();
  form.set("tripId", TRIP_ID);
  form.set("type", "food");
  form.set("title", "공항에서 만나기");
  form.set("startLocal", "2026-02-14T09:00");
  form.set("locationText", locationText);
  return form;
}

/*
 * 좌표는 지도에 점을 찍기 위한 덤이지 저장의 조건이 아니다.
 * 예전에는 Kakao 가 못 찾으면 일정 추가 자체가 거부됐고, 그래서 검색이 막히면
 * "수동 입력은 유지" 라는 degraded mode 정책이 통째로 무너졌다.
 */
describe("createItemAction — 장소 조회 실패와 무관하게 저장한다", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrip.mockResolvedValue({ id: TRIP_ID, timezone: "Asia/Tokyo" });
  });

  it("지도에서 못 찾은 장소도 글자로 저장한다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.searchPlaces.mockResolvedValue({ results: [] });
    const { createItemAction } = await import("@/features/trips/actions");

    const state = await createItemAction({ status: "idle" }, itemForm("공항 3층 만남의 광장"));

    expect(state.status).not.toBe("error");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        location_text: "공항 3층 만남의 광장",
        place_snapshot: null,
      }),
    );
  });

  it("장소 검색이 막혀 있어도 저장한다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.searchPlaces.mockRejectedValue(
      new PlaceSearchError("KAKAO_REST_API_KEY 가 없습니다.", "not_configured"),
    );
    const { createItemAction } = await import("@/features/trips/actions");

    const state = await createItemAction({ status: "idle" }, itemForm("신주쿠 3초메"));

    expect(state.status).not.toBe("error");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ place_snapshot: null }));
  });

  it("장소를 비워도 저장하고 검색을 부르지 않는다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    const { createItemAction } = await import("@/features/trips/actions");

    const state = await createItemAction({ status: "idle" }, itemForm(""));

    expect(state.status).not.toBe("error");
    expect(mocks.searchPlaces).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ location_text: null, place_snapshot: null }),
    );
  });

  it("찾으면 좌표 스냅샷을 붙인다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    mocks.searchPlaces.mockResolvedValue({ results: [KAKAO_HIT] });
    const { createItemAction } = await import("@/features/trips/actions");

    await createItemAction({ status: "idle" }, itemForm("이치란 신주쿠"));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        place_snapshot: expect.objectContaining({ latitude: 35.69, longitude: 139.7 }),
      }),
    );
  });
});
