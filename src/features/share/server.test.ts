import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ serviceClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: mocks.serviceClient,
}));

const SHORT_ID = "abc123";
const TRIP_ID = "00000000-0000-4000-8000-000000000010";
const TOKEN = "raw-share-token";
/** sha256("raw-share-token") */
const TOKEN_HASH = "14b4eb7544df712222ac578b4a5f8d92bd7563037f08da899205f5102345e3ea";

type LinkRow = {
  id?: string;
  trip_id: string;
  short_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  access_count?: number;
};

/**
 * token_hash 로만 행을 찾는 가짜 PostgREST.
 *
 * 해시가 아닌 값으로 조회하면 아무것도 돌려주지 않는다 — 토큰 원문을 그대로
 * 비교하는 구현으로 되돌아가면 테스트가 깨지도록.
 */
function shareClient(row: LinkRow | null, hash: string) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const table = (name: string) => {
    if (name === "trip_share_links") {
      return {
        select: () => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async () => ({ data: value === hash ? row : null, error: null }),
          }),
        }),
        update,
      };
    }
    throw new Error(`예상하지 못한 테이블: ${name}`);
  };
  return { client: { from: vi.fn((name: string) => table(name)) }, update };
}

describe("공유 토큰 검증", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 읽기 경로는 service role 키가 있어야 동작한다. 테스트에서는 값만 채운다.
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });
  afterEach(() => vi.unstubAllEnvs());

  const live: LinkRow = {
    id: "link-1",
    trip_id: TRIP_ID,
    short_id: SHORT_ID,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    revoked_at: null,
    access_count: 3,
  };

  it("살아 있는 토큰은 short_id 를 돌려주고 열람 기록을 올린다", async () => {
    const { client, update } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { redeemShareToken } = await import("@/features/share/server");

    await expect(redeemShareToken(TOKEN)).resolves.toEqual({
      shortId: SHORT_ID,
      tripId: TRIP_ID,
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ access_count: 4 }));
  });

  it("폐기된 링크는 거부한다", async () => {
    const { client } = shareClient({ ...live, revoked_at: new Date().toISOString() }, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { redeemShareToken } = await import("@/features/share/server");
    await expect(redeemShareToken(TOKEN)).resolves.toBeNull();
  });

  it("만료된 링크는 거부한다", async () => {
    const expired = { ...live, expires_at: new Date(Date.now() - 1000).toISOString() };
    const { client } = shareClient(expired, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { redeemShareToken } = await import("@/features/share/server");
    await expect(redeemShareToken(TOKEN)).resolves.toBeNull();
  });

  it("없는 토큰은 거부한다", async () => {
    const { client } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { redeemShareToken } = await import("@/features/share/server");
    await expect(redeemShareToken("아무 토큰")).resolves.toBeNull();
  });

  it("빈 토큰은 DB 를 묻지도 않는다", async () => {
    const { client } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { redeemShareToken } = await import("@/features/share/server");
    await expect(redeemShareToken("")).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });

  /*
   * 쿠키를 들고 주소만 바꿔 다른 여행을 여는 것을 막는다.
   * short_id 만으로 판정하면 그대로 뚫린다.
   */
  it("쿠키의 토큰이 가리키는 여행이 아니면 거부한다", async () => {
    const { client } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { verifyShareCookie } = await import("@/features/share/server");

    await expect(verifyShareCookie(TOKEN, SHORT_ID)).resolves.toMatchObject({ tripId: TRIP_ID });
    await expect(verifyShareCookie(TOKEN, "다른-여행")).resolves.toBeNull();
  });

  it("쿠키가 없으면 거부한다", async () => {
    const { client } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { verifyShareCookie } = await import("@/features/share/server");
    await expect(verifyShareCookie(undefined, SHORT_ID)).resolves.toBeNull();
  });

  it("쿠키 검증은 열람 수를 올리지 않는다", async () => {
    const { client, update } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { verifyShareCookie } = await import("@/features/share/server");
    await verifyShareCookie(TOKEN, SHORT_ID);
    expect(update).not.toHaveBeenCalled();
  });

  /*
   * 키가 없으면 공개 경로가 스택 트레이스와 함께 500 이 됐다.
   * 링크를 못 여는 것과 서버가 터지는 것은 다르다.
   */
  it("service role 키가 없으면 던지지 않고 거부한다", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { client } = shareClient(live, TOKEN_HASH);
    mocks.serviceClient.mockReturnValue(client);
    const { isShareReadable, redeemShareToken, verifyShareCookie } = await import(
      "@/features/share/server"
    );

    expect(isShareReadable()).toBe(false);
    await expect(redeemShareToken(TOKEN)).resolves.toBeNull();
    await expect(verifyShareCookie(TOKEN, SHORT_ID)).resolves.toBeNull();
    expect(client.from).not.toHaveBeenCalled();
  });
});
