import { beforeEach, expect, it, vi } from "vitest";
import { addManualFlightAction } from "./actions";
import { IDLE } from "@/features/trips/action-state";
const mocks = vi.hoisted(() => ({ client: vi.fn(), trip: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/features/trips/queries", () => ({ getTrip: mocks.trip }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
function form(note: string) {
  const f = new FormData();
  Object.entries({ tripId: "00000000-0000-4000-8000-000000000001", flightNumber: "KE703", departureAirport: "ICN", arrivalAirport: "NRT", departureLocal: "2026-10-05T09:00", arrivalLocal: "2026-10-05T11:30", note }).forEach(([k,v]) => f.set(k,v));
  return f;
}
beforeEach(() => { vi.clearAllMocks(); mocks.trip.mockResolvedValue({ timezone: "Asia/Seoul" }); });
it("saves a manual flight's note on its itinerary, not the shared flight record", async () => {
  const insertItem = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => ({ insert: insertItem }));
  const rpc = vi.fn((name: string) => Promise.resolve(name === "save_flight" ? { data: "flight", error: null } : { data: 1000, error: null }));
  mocks.client.mockResolvedValue({ from, rpc });
  expect((await addManualFlightAction(IDLE, form("예약 ABC\n수하물 1개"))).status).toBe("success");
  expect(insertItem).toHaveBeenCalledWith(expect.objectContaining({ type: "flight", note: "예약 ABC\n수하물 1개", flight_id: "flight" }));
  // 공유 flights 행은 편집 권한을 확인하는 RPC 로만 저장하고, 메모는 싣지 않는다.
  expect(from).not.toHaveBeenCalledWith("flights");
  const saveCall = rpc.mock.calls.find(([name]) => name === "save_flight") as unknown as [string, { p_trip_id: string; p_flight: object }];
  expect(saveCall[1].p_trip_id).toBe("00000000-0000-4000-8000-000000000001");
  expect(saveCall[1].p_flight).not.toHaveProperty("note");
});
it("rejects an overlong note before writing either record", async () => {
  expect((await addManualFlightAction(IDLE, form("x".repeat(2001)))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
it("rejects an arrival before departure without writes and keeps the typed values", async () => {
  const f = form("메모");
  f.set("arrivalLocal", "2026-10-05T08:00");
  const state = await addManualFlightAction(IDLE, f);
  expect(state.status).toBe("error");
  expect(state.message).toMatch(/도착 시각이 출발 시각보다 이릅니다/);
  expect(state.fieldErrors?.arrivalLocal).toBeDefined();
  // React 19 폼 리셋 뒤에도 입력을 되살릴 수 있게 제출 값을 돌려준다.
  expect(state.values).toMatchObject({ flightNumber: "KE703", arrivalLocal: "2026-10-05T08:00", note: "메모" });
  expect(mocks.client).not.toHaveBeenCalled();
});
it("accepts a date-line crossing that arrives on an earlier local date", async () => {
  const insertItem = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn((name: string) => Promise.resolve(name === "save_flight" ? { data: "flight", error: null } : { data: 1000, error: null }));
  mocks.client.mockResolvedValue({ from: vi.fn(() => ({ insert: insertItem })), rpc });
  const f = form("");
  // 인천 20:00 출발 → 호놀룰루 같은 날 09:30 도착(현지). UTC 로는 도착이 뒤다.
  f.set("arrivalAirport", "HNL");
  f.set("departureLocal", "2026-10-05T20:00");
  f.set("arrivalLocal", "2026-10-05T09:30");
  f.set("arrivalTimezone", "Pacific/Honolulu");
  expect((await addManualFlightAction(IDLE, f)).status).toBe("success");
});
