import { beforeEach, expect, it, vi } from "vitest";
import { addPlaceToTripAction } from "./actions";
import { IDLE } from "@/features/trips/action-state";
const mocks = vi.hoisted(() => ({ client: vi.fn(), trip: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/features/trips/queries", () => ({ getTrip: mocks.trip }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const input = { tripId: "00000000-0000-4000-8000-000000000001", provider: "kakao", providerPlaceId: "place", name: "숙소", categoryGroup: "lodging", category: null, address: null, roadAddress: null, phone: null, url: null, latitude: 37, longitude: 127, cuisineType: null, googleRating: null, closedOnDate: null, startLocal: "2026-10-05T15:00", endLocal: "2026-10-07T11:00", note: "예약번호 123\n늦은 체크인" };
function form(overrides = {}) { const f = new FormData(); f.set("payload", JSON.stringify({ ...input, ...overrides })); return f; }
beforeEach(() => { vi.clearAllMocks(); mocks.trip.mockResolvedValue({ timezone: "Asia/Seoul" }); });
it("stores both lodging dates in UTC and preserves multiline notes", async () => {
  const insertItem = vi.fn().mockResolvedValue({ error: null });
  const q = { insert: vi.fn(), select: vi.fn(), single: vi.fn().mockResolvedValue({ data: { id: "place" }, error: null }) };
  q.insert.mockReturnValue(q); q.select.mockReturnValue(q);
  mocks.client.mockResolvedValue({ from: (table: string) => table === "places" ? q : { insert: insertItem }, rpc: vi.fn().mockResolvedValue({ data: 1000, error: null }) });
  expect((await addPlaceToTripAction(IDLE, form())).status).toBe("success");
  expect(insertItem).toHaveBeenCalledWith(expect.objectContaining({ type: "lodging", start_at: "2026-10-05T06:00:00.000Z", end_at: "2026-10-07T02:00:00.000Z", note: input.note }));
});
it("rejects missing, equal and earlier checkout dates without writes", async () => {
  const from = vi.fn(); mocks.client.mockResolvedValue({ from });
  for (const endLocal of ["", input.startLocal, "2026-10-04T11:00"]) {
    expect((await addPlaceToTripAction(IDLE, form({ endLocal }))).status).toBe("error");
  }
  expect(from).not.toHaveBeenCalled();
});
it("rejects overlong notes before accessing the database", async () => {
  expect((await addPlaceToTripAction(IDLE, form({ note: "a".repeat(2001) }))).status).toBe("error");
  expect(mocks.client).not.toHaveBeenCalled();
});
