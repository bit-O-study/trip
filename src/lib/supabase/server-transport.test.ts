// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { serverTransport } from "./server-transport";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const publicUrl = "https://api.example.com/trip";

it("keeps the existing transport when no internal URL is configured", () => {
  vi.stubEnv("SUPABASE_INTERNAL_URL", "");
  expect(serverTransport(publicUrl)).toEqual({});
});

it("preserves authenticated REST and auth requests, body and abort signal", async () => {
  vi.stubEnv("SUPABASE_INTERNAL_URL", "http://127.0.0.1:4200/trip");
  const mock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", mock);
  const transport = serverTransport(publicUrl).global!.fetch;
  const controller = new AbortController();
  const init = { method: "POST", headers: { Authorization: "Bearer user-token", apikey: "anon", "Content-Profile": "trip" }, body: '{"title":"test"}', signal: controller.signal };
  await transport(`${publicUrl}/rest/v1/itinerary_items?select=id`, init);
  expect(mock.mock.calls[0][0].href).toBe("http://127.0.0.1:4200/trip/rest/v1/itinerary_items?select=id");
  expect(mock.mock.calls[0][1]).toBe(init);
  await transport(new Request(`${publicUrl}/auth/v1/token?grant_type=refresh_token`, init));
  const request = mock.mock.calls[1][0] as Request;
  expect(request.url).toBe("http://127.0.0.1:4200/trip/auth/v1/token?grant_type=refresh_token");
  expect(request.headers.get("Authorization")).toBe("Bearer user-token");
  expect(await request.text()).toBe(init.body);
});

it("rejects non-loopback targets, a different project and unrelated requests", () => {
  for (const url of ["https://evil.example/trip", "http://127.0.0.1:4200/other", "http://user:password@127.0.0.1:4200/trip"]) {
    vi.stubEnv("SUPABASE_INTERNAL_URL", url);
    expect(() => serverTransport(publicUrl)).toThrow();
  }
  vi.stubEnv("SUPABASE_INTERNAL_URL", "http://127.0.0.1:4200/trip");
  const transport = serverTransport(publicUrl).global!.fetch;
  expect(() => transport("https://other.example/trip/auth/v1/user")).toThrow();
  expect(() => transport("https://api.example.com/trip-other/auth/v1/user")).toThrow();
});
