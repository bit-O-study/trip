// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut, createClient } = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: createClient,
}));

import { POST } from "./route";

describe("signout behind a reverse proxy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createClient.mockResolvedValue({ auth: { signOut } });
    signOut.mockResolvedValue({ error: null });
  });

  it("signs out and redirects with GET on the browser's public origin", async () => {
    const response = await POST();
    expect(signOut).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    const location = response.headers.get("location")!;
    expect(new URL(location, "https://trip.helthssu.co.kr/auth/signout").href)
      .toBe("https://trip.helthssu.co.kr/login");
    expect(new URL(location, "http://localhost:3100/auth/signout").href)
      .toBe("http://localhost:3100/login");
  });

  it("keeps the login redirect on the same origin if the auth client throws", async () => {
    createClient.mockRejectedValue(new Error("unavailable"));
    const response = await POST();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
  });
});
