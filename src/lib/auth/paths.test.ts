import { describe, expect, it } from "vitest";

import { isPublicPath, requiresAuth } from "@/lib/auth/paths";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/auth/callback",
    "/auth/signout",
    "/auth/auth-code-error",
    "/share/abc123",
    "/s/xyz789",
  ])("%s 는 인증 없이 접근할 수 있다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/", "/trips/new", "/trips/abc/map", "/trips/abc/settings"])(
    "%s 는 인증이 필요하다",
    (pathname) => {
      expect(requiresAuth(pathname)).toBe(true);
    },
  );

  it("접두사만 같은 경로를 공개로 착각하지 않는다", () => {
    // "/s" 가 공개라고 해서 "/search" 나 "/settings" 가 열리면 안 된다.
    expect(isPublicPath("/search")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
    // "/login" 접두사를 노린 경로
    expect(isPublicPath("/loginhack")).toBe(false);
    // "/auth" 접두사를 노린 경로
    expect(isPublicPath("/authorize")).toBe(false);
  });

  it("기본값은 보호다", () => {
    // 새 페이지를 추가했는데 목록에 넣는 것을 잊어도 열리지 않아야 한다.
    expect(requiresAuth("/some/brand/new/page")).toBe(true);
  });
});
