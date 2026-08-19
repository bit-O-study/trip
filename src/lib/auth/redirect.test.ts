import { describe, expect, it } from "vitest";

import { buildLoginUrl, safeRedirectPath } from "@/lib/auth/redirect";

describe("safeRedirectPath", () => {
  it("같은 출처의 절대 경로는 통과시킨다", () => {
    expect(safeRedirectPath("/trips/abc")).toBe("/trips/abc");
    expect(safeRedirectPath("/trips/abc?day=2")).toBe("/trips/abc?day=2");
  });

  it("값이 없으면 기본 경로를 쓴다", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
  });

  // 오픈 리다이렉트: 우리 도메인에서 로그인시킨 뒤 공격자 사이트로 보내는 피싱
  it.each([
    ["절대 URL", "https://evil.example/steal"],
    ["프로토콜 상대 URL", "//evil.example"],
    ["백슬래시 우회", "/\\evil.example"],
    ["백슬래시 혼합", "/path\\..\\evil"],
    ["스킴", "javascript:alert(1)"],
    ["상대 경로", "trips/abc"],
    ["데이터 URL", "data:text/html,<script>"],
  ])("%s 는 거부한다", (_label, input) => {
    expect(safeRedirectPath(input)).toBe("/");
  });

  it("제어문자를 끼워 넣은 우회를 거부한다", () => {
    expect(safeRedirectPath(`/${String.fromCharCode(9)}/evil.example`)).toBe("/");
    expect(safeRedirectPath(`/${String.fromCharCode(10)}//evil.example`)).toBe("/");
    expect(safeRedirectPath(`/${String.fromCharCode(0)}`)).toBe("/");
  });

  it("거부 시 지정한 대체 경로를 쓴다", () => {
    expect(safeRedirectPath("https://evil.example", "/login")).toBe("/login");
  });
});

describe("buildLoginUrl", () => {
  it("돌아갈 경로를 next 로 붙인다", () => {
    expect(buildLoginUrl("/trips/abc")).toBe("/login?next=%2Ftrips%2Fabc");
  });

  it("쿼리스트링도 보존한다", () => {
    expect(buildLoginUrl("/trips/abc?day=2")).toBe("/login?next=%2Ftrips%2Fabc%3Fday%3D2");
  });

  it("루트로 돌아갈 때는 next 를 붙이지 않는다", () => {
    expect(buildLoginUrl("/")).toBe("/login");
  });

  it("위험한 경로는 next 에 실리지 않는다", () => {
    expect(buildLoginUrl("//evil.example")).toBe("/login");
  });
});
