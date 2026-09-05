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
