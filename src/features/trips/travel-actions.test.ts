import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE } from "./action-state";
import { saveTravelLeg } from "./travel-actions";

const mocks = vi.hoisted(() => ({ client: vi.fn(), trip: vi.fn(), items: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("./queries", () => ({ getTrip: mocks.trip, listItems: mocks.items }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const tripId = "00000000-0000-4000-8000-000000000001";
const fromId = "00000000-0000-4000-8000-000000000002";
const toId = "00000000-0000-4000-8000-000000000003";
function form(version = 0) {
  const f = new FormData();
  Object.entries({ tripId, fromId, toId, version: String(version), mode: "train", minutes: "90", distanceKm: "" }).forEach(([k,v]) => f.set(k,v));
  return f;
}
function client(result = { data: [{ version: 1 }], error: null } as { data: unknown[] | null; error: { code: string } | null }) {
  const q = { insert: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn().mockResolvedValue(result) };
  q.insert.mockReturnValue(q); q.update.mockReturnValue(q); q.eq.mockReturnValue(q);
  mocks.client.mockResolvedValue({ from: vi.fn().mockReturnValue(q) });
  return q;
}
describe("saveTravelLeg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.trip.mockResolvedValue({ role: "editor", deletedAt: null });
    mocks.items.mockResolvedValue([{ id: fromId, coordinate: { latitude: 37, longitude: 127 } }, { id: toId, coordinate: { latitude: 38, longitude: 128 } }]);
  });
  it("stores directional endpoints and server-derived location snapshots", async () => {
    const q = client();
    expect((await saveTravelLeg(IDLE, form())).status).toBe("success");
    expect(q.insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: tripId, from_item_id: fromId, to_item_id: toId, mode: "train", minutes: 90, distance_km: null, from_location_key: "37,127", to_location_key: "38,128", version: 1 }));
    expect(mocks.revalidate).toHaveBeenCalledWith(`/trips/${tripId}`);
  });
  it("rejects viewers and deleted trips before writing", async () => {
    for (const trip of [{ role: "viewer" }, { role: "owner", deletedAt: "2026-10-05" }, null]) {
      mocks.trip.mockResolvedValue(trip);
      expect((await saveTravelLeg(IDLE, form())).status).toBe("error");
    }
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("rejects stale adjacency after a reorder", async () => {
    mocks.items.mockResolvedValue([{ id: toId }, { id: fromId }]);
    expect((await saveTravelLeg(IDLE, form())).message).toContain("순서");
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses the submitted version to reject concurrent updates", async () => {
    const q = client({ data: [], error: null });
    expect((await saveTravelLeg(IDLE, form(2))).message).toContain("먼저 수정");
    expect(q.eq).toHaveBeenCalledWith("version", 2);
    expect(q.update).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("reports concurrent creates and database failures without leaking details", async () => {
    client({ data: null, error: { code: "23505" } });
    expect((await saveTravelLeg(IDLE, form())).message).toContain("먼저 수정");
    client({ data: null, error: { code: "42501" } });
    expect((await saveTravelLeg(IDLE, form())).message).toContain("저장하지 못했습니다");
  });
  it("rejects negative duration before authorization or storage", async () => {
    const f = form(); f.set("minutes", "-1");
    expect((await saveTravelLeg(IDLE, f)).status).toBe("error");
    expect(mocks.trip).not.toHaveBeenCalled();
  });
});
