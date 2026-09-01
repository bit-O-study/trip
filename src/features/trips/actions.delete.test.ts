import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

const TRIP_ID = "00000000-0000-4000-8000-000000000010";
const ITEM_ID = "00000000-0000-4000-8000-000000000020";
const ITEM_ID_2 = "00000000-0000-4000-8000-000000000021";

function deleteClient(result: { data: Array<{ id: string }> | null; error: { message: string } | null }) {
  const select = vi.fn().mockResolvedValue(result);
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    select,
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue(query),
    },
    query,
  };
}

describe("삭제 Server Actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("일정 삭제는 item과 trip을 함께 제한하고 변경된 행을 확인한다", async () => {
    const { client, query } = deleteClient({ data: [{ id: ITEM_ID }], error: null });
    mocks.createClient.mockResolvedValue(client);
    const { deleteItemAction } = await import("@/features/trips/actions");
    const form = new FormData();
    form.set("tripId", TRIP_ID);
    form.set("itemId", ITEM_ID);

    await deleteItemAction(form);

    expect(query.eq).toHaveBeenCalledWith("id", ITEM_ID);
    expect(query.eq).toHaveBeenCalledWith("trip_id", TRIP_ID);
    expect(query.select).toHaveBeenCalledWith("id");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
  });

  it("RLS로 0행이 변경되면 삭제 성공으로 처리하지 않는다", async () => {
    const { client } = deleteClient({ data: [], error: null });
    mocks.createClient.mockResolvedValue(client);
    const { deleteItemAction } = await import("@/features/trips/actions");
    const form = new FormData();
    form.set("tripId", TRIP_ID);
    form.set("itemId", ITEM_ID);

    await expect(deleteItemAction(form)).rejects.toThrow(/권한이 없거나 이미 삭제/);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("잘못된 삭제 ID는 DB 요청 전에 거부한다", async () => {
    const { deleteItemAction } = await import("@/features/trips/actions");
    const form = new FormData();
    form.set("tripId", TRIP_ID);
    form.set("itemId", "not-a-uuid");

    await expect(deleteItemAction(form)).rejects.toThrow("올바르지 않은 일정");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("선택한 여러 일정을 한 요청으로 삭제한다", async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: ITEM_ID }, { id: ITEM_ID_2 }], error: null });
    const query = { update: vi.fn(), eq: vi.fn(), in: vi.fn(), is: vi.fn(), select };
    query.update.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.is.mockReturnValue(query);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue(query),
    });
    const { deleteItemsAction } = await import("@/features/trips/actions");
    const form = new FormData();
    form.set("tripId", TRIP_ID);
    form.append("itemId", ITEM_ID);
    form.append("itemId", ITEM_ID_2);

    await deleteItemsAction(form);

    expect(query.eq).toHaveBeenCalledWith("trip_id", TRIP_ID);
    expect(query.in).toHaveBeenCalledWith("id", [ITEM_ID, ITEM_ID_2]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/trips/${TRIP_ID}`);
  });
});
