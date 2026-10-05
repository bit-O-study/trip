import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));

const TRIP_ID = "00000000-0000-4000-8000-000000000010";
const USER_ID = "00000000-0000-4000-8000-0000000000a1";

/**
 * `trip_members_select` 정책은 같은 여행의 **모든** 멤버 행을 보여 준다.
 * 그래서 이 가짜 클라이언트도 user_id 조건이 붙었을 때만 한 행으로 좁힌다 —
 * 조건을 빠뜨리면 실제 PostgREST 처럼 PGRST116 을 돌려준다.
 */
function membersClient(rows: Array<{ user_id: string; role: string }>) {
  const filters: Array<[string, string]> = [];
  const query = {
    select: vi.fn(),
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      const matched = rows.filter((row) =>
        filters.every(([column, value]) => column !== "user_id" || row.user_id === value),
      );
      if (matched.length > 1) {
        return {
          data: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
          },
        };
      }
      return { data: matched[0] ?? null, error: null };
    }),
  };
  query.select.mockReturnValue(query);

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
    from: vi.fn().mockReturnValue(query),
    filters,
  };
}

describe("getTripRole", () => {
  beforeEach(() => vi.clearAllMocks());

  it("멤버가 여럿인 여행에서도 자기 역할만 읽는다", async () => {
    const client = membersClient([
      { user_id: USER_ID, role: "owner" },
      { user_id: "00000000-0000-4000-8000-0000000000b2", role: "viewer" },
    ]);
    mocks.createClient.mockResolvedValue(client);
    const { getTripRole } = await import("@/features/trips/queries");

    await expect(getTripRole(TRIP_ID)).resolves.toBe("owner");
    expect(client.filters).toContainEqual(["user_id", USER_ID]);
  });

  it("멤버가 아니면 null 이다", async () => {
    mocks.createClient.mockResolvedValue(
      membersClient([{ user_id: "00000000-0000-4000-8000-0000000000b2", role: "owner" }]),
    );
    const { getTripRole } = await import("@/features/trips/queries");

    await expect(getTripRole(TRIP_ID)).resolves.toBeNull();
  });

  it("로그인하지 않았으면 DB 를 묻지 않고 null 이다", async () => {
    const client = membersClient([{ user_id: USER_ID, role: "owner" }]);
    client.auth.getUser.mockResolvedValue({ data: { user: null } });
    mocks.createClient.mockResolvedValue(client);
    const { getTripRole } = await import("@/features/trips/queries");

    await expect(getTripRole(TRIP_ID)).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("listRestaurantPolls fast path", () => {
  beforeEach(() => vi.clearAllMocks());
  function pollsClient(polls: object[]) {
    const makeQuery = (data: object[]) => {
      const q = { select: vi.fn(), eq: vi.fn(), not: vi.fn(), in: vi.fn(), is: vi.fn(), order: vi.fn().mockResolvedValue({ data, error: null }) };
      for (const method of [q.select, q.eq, q.not, q.in, q.is]) method.mockReturnValue(q);
      return q;
    };
    const pollQuery = makeQuery(polls);
    const db = { from: vi.fn((table: string) => table === "restaurant_polls" ? pollQuery : makeQuery([])), rpc: vi.fn().mockResolvedValue({ error: null }), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } };
    mocks.createClient.mockResolvedValue(db);
    return { db, pollQuery };
  }
  it("skips finalization, auth and candidates when a trip has no polls", async () => {
    const { db } = pollsClient([]);
    const { listRestaurantPolls } = await import("./queries");
    expect(await listRestaurantPolls(TRIP_ID)).toEqual([]);
    expect(db.from).toHaveBeenCalledTimes(1);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.auth.getUser).not.toHaveBeenCalled();
  });
  it("does not finalize polls before their deadline", async () => {
    const { db } = pollsClient([{ id: "poll", status: "open", closes_at: "2099-01-01T00:00:00Z" }]);
    const { listRestaurantPolls } = await import("./queries");
    expect(await listRestaurantPolls(TRIP_ID)).toHaveLength(1);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("finalizes expired polls and rereads their current result", async () => {
    const { db, pollQuery } = pollsClient([{ id: "poll", status: "open", closes_at: "2000-01-01T00:00:00Z" }]);
    const { listRestaurantPolls } = await import("./queries");
    await listRestaurantPolls(TRIP_ID);
    expect(db.rpc).toHaveBeenCalledWith("finalize_due_restaurant_polls");
    expect(pollQuery.order).toHaveBeenCalledTimes(2);
  });
});
