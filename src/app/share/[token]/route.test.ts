// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ redeem: vi.fn(), readable: vi.fn() }));

vi.mock("@/features/share/server", () => ({
  redeemShareToken: mocks.redeem,
  isShareReadable: mocks.readable,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readable.mockReturnValue(true);
});

function call(token: string, ip = "203.0.113.1") {
  return GET(
    new Request(`https://trip.example/share/${token}`, { headers: { "x-forwarded-for": ip } }),
    { params: Promise.resolve({ token }) },
  );
}

it("공유 쿠키는 그 공유 뷰 경로에만 붙는다", async () => {
  mocks.redeem.mockResolvedValue({ shortId: "AbC_12-x", tripId: "t1" });
  const response = await call("tok-1");

  expect(response.headers.get("location")).toBe("https://trip.example/s/AbC_12-x");
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toMatch(/Path=\/s\/AbC_12-x/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("유효하지 않은 토큰은 쿠키 없이 안내 화면으로 보낸다", async () => {
  mocks.redeem.mockResolvedValue(null);
  const response = await call("bad", "203.0.113.2");
  expect(response.headers.get("location")).toBe("https://trip.example/share/invalid?reason=invalid");
  expect(response.headers.get("set-cookie")).toBeNull();
});
