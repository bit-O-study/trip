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
  const q = { insert: vi.fn(), select: vi.fn(), single: vi.fn().mockResolvedValue({ data: { id: "flight" }, error: null }) };
  q.insert.mockReturnValue(q); q.select.mockReturnValue(q);
  mocks.client.mockResolvedValue({ from: (table: string) => table === "flights" ? q : { insert: insertItem }, rpc: vi.fn().mockResolvedValue({ data: 1000, error: null }) });
  expect((await addManualFlightAction(IDLE, form("예약 ABC\n수하물 1개"))).status).toBe("success");
  expect(insertItem).toHaveBeenCalledWith(expect.objectContaining({ type: "flight", note: "예약 ABC\n수하물 1개" }));
  expect(q.insert.mock.calls[0][0]).not.toHaveProperty("note");
});
it("rejects an overlong note before writing either record", async () => {
  expect((await addManualFlightAction(IDLE, form("x".repeat(2001)))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
