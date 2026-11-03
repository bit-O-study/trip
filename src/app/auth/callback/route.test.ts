// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ exchange: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }),
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://trip.example");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("AUTH_TRUSTED_HOSTS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function call(headers: Record<string, string>) {
  return GET(new Request("http://internal:3000/auth/callback?code=abc&next=/trips", { headers }));
}

it("허용된 x-forwarded-host 면 그 호스트로 돌려보낸다", async () => {
  const response = await call({ "x-forwarded-host": "trip.example", "x-forwarded-proto": "https" });
  expect(response.headers.get("location")).toBe("https://trip.example/trips");
});

it("모르는 x-forwarded-host 는 무시하고 설정된 사이트 주소로 보낸다", async () => {
  const response = await call({ "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" });
  expect(response.headers.get("location")).toBe("https://trip.example/trips");
});

it("x-forwarded-proto 에 이상한 값이 오면 쓰지 않는다", async () => {
  const response = await call({ "x-forwarded-host": "trip.example", "x-forwarded-proto": "javascript" });
  expect(response.headers.get("location")).toBe("http://trip.example/trips");
});

it("프록시 헤더가 없으면 요청 출처를 쓴다", async () => {
  const response = await call({});
  expect(response.headers.get("location")).toBe("http://internal:3000/trips");
});
