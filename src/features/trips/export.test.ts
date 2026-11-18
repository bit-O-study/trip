import { beforeEach, expect, it, vi } from "vitest";
import { buildTripExport } from "./export";

const mocks = vi.hoisted(() => ({ trip: vi.fn(), packing: vi.fn() }));
vi.mock("@/features/packing/queries", () => ({ listPackingItems: mocks.packing }));
vi.mock("@/features/expenses/queries", () => ({ listExpenses: async () => [] }));
vi.mock("@/features/restaurants/queries", () => ({ listSavedRestaurants: async () => [] }));
vi.mock("@/features/trips/queries", () => ({
  getTrip: mocks.trip, listItems: async () => [], listTripMembers: async () => [],
  listRestaurantPolls: async () => [], listTravelLegs: async () => [], currentTravelLegs: () => [],
}));
beforeEach(() => {
  mocks.trip.mockReset().mockResolvedValue({ id: "trip", title: "여행" });
  mocks.packing.mockReset().mockResolvedValue([]);
});
it("준비물의 분류·체크 상태와 기존 여행 데이터를 함께 내보낸다", async () => {
  const items = [{ id: "passport", title: "여권", category: "서류", checked: true, updated_at: "2026-11-18T00:00:00Z" }];
  mocks.packing.mockResolvedValue(items);
  const result = await buildTripExport("trip");
  expect(result).toMatchObject({ schemaVersion: 7, packingItems: items, expenses: [], savedRestaurants: [], trip: { id: "trip" } });
  expect(mocks.packing).toHaveBeenCalledWith("trip");
});
it("준비물 조회 실패를 빈 목록으로 숨기지 않는다", async () => {
  mocks.packing.mockRejectedValue(new Error("준비물 조회 실패"));
  await expect(buildTripExport("trip")).rejects.toThrow("준비물 조회 실패");
});
it("접근할 수 없는 여행에서는 준비물을 조회하지 않는다", async () => {
  mocks.trip.mockResolvedValue(null);
  expect(await buildTripExport("hidden")).toBeNull();
  expect(mocks.packing).not.toHaveBeenCalled();
});
