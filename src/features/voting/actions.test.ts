import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
  getTrip: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/trips/queries", () => ({ getTrip: mocks.getTrip }));

const TRIP_ID = "00000000-0000-4000-8000-000000000010";
const TZ = "Asia/Seoul";

function insertClient() {
  const single = vi.fn().mockResolvedValue({ data: { id: "poll-1" }, error: null });
  const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn().mockReturnValue({ insert }),
    },
    insert,
  };
}

/** 여행 시간대(KST) 기준 로컬 입력값. */
function localAfter(hours: number): string {
  const at = new Date(Date.now() + hours * 3_600_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const hour = read("hour") === "24" ? "00" : read("hour");
  return `${read("year")}-${read("month")}-${read("day")}T${hour}:${read("minute")}`;
}

function pollForm(closesLocal: string, scheduledLocal: string) {
  const form = new FormData();
  form.set("tripId", TRIP_ID);
  form.set("title", "첫날 점심");
  form.set("location", "제주 연동");
  form.set("closesLocal", closesLocal);
  form.set("scheduledLocal", scheduledLocal);
  return form;
}

describe("createRestaurantPollAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrip.mockResolvedValue({ id: TRIP_ID, timezone: TZ });
  });

  /*
   * finalize_due_restaurant_polls() 는 closes_at <= now() 인 투표를 즉시 확정한다.
   * 지난 시각으로 만들면 후보를 넣기도 전에 "투표 종료 · 후보 없음" 이 된다.
   */
  it("이미 지난 종료 시각은 거부한다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    const { createRestaurantPollAction } = await import("@/features/voting/actions");

    const state = await createRestaurantPollAction(
      { status: "idle" },
      pollForm(localAfter(-2), localAfter(2)),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.closesLocal?.[0]).toMatch(/지난 시각/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("종료 시각이 식사 시각보다 늦으면 거부한다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    const { createRestaurantPollAction } = await import("@/features/voting/actions");

    const state = await createRestaurantPollAction(
      { status: "idle" },
      pollForm(localAfter(5), localAfter(3)),
    );

    expect(state.status).toBe("error");
    expect(state.fieldErrors?.closesLocal?.[0]).toMatch(/빨라야/);
    expect(insert).not.toHaveBeenCalled();
  });

  it("앞으로의 시각이면 투표를 만들고 상세로 보낸다", async () => {
    const { client, insert } = insertClient();
    mocks.createClient.mockResolvedValue(client);
    const { createRestaurantPollAction } = await import("@/features/voting/actions");

    await createRestaurantPollAction({ status: "idle" }, pollForm(localAfter(2), localAfter(4)));

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: TRIP_ID }));
    expect(mocks.redirect).toHaveBeenCalledWith(
      `/trips/${TRIP_ID}/polls/poll-1?q=%EC%A0%9C%EC%A3%BC+%EC%97%B0%EB%8F%99`,
    );
  });
});

describe("revokeVoteInvitesAction", () => {
  function revokeClient(rows: Array<{ id: string }>) {
    const calls: Array<[string, unknown]> = [];
    const chain = {
      eq: vi.fn((column: string, value: unknown) => {
        calls.push([column, value]);
        return chain;
      }),
      is: vi.fn(() => chain),
      select: vi.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const update = vi.fn().mockReturnValue(chain);
    return { client: { from: vi.fn().mockReturnValue({ update }) }, update, calls };
  }

  function revokeForm(inviteId?: string) {
    const form = new FormData();
    form.set("tripId", TRIP_ID);
    if (inviteId) form.set("inviteId", inviteId);
    return form;
  }

  it("inviteId 가 있으면 그 링크 하나만 폐기한다", async () => {
    const inviteId = "00000000-0000-4000-8000-0000000000aa";
    const { client, update, calls } = revokeClient([{ id: inviteId }]);
    mocks.createClient.mockResolvedValue(client);
    const { revokeVoteInvitesAction } = await import("@/features/voting/actions");

    const state = await revokeVoteInvitesAction({ status: "idle" }, revokeForm(inviteId));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
    expect(calls).toContainEqual(["id", inviteId]);
    expect(state).toMatchObject({ status: "revoked", revokedIds: [inviteId] });
  });

  it("폐기된 행이 없으면(권한 없음 포함) 오류로 알린다", async () => {
    const { client } = revokeClient([]);
    mocks.createClient.mockResolvedValue(client);
    const { revokeVoteInvitesAction } = await import("@/features/voting/actions");

    const state = await revokeVoteInvitesAction({ status: "idle" }, revokeForm());
    expect(state.status).toBe("error");
  });
});
