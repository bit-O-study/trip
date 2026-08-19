import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allowsUnconfiguredAuth,
  isSupabaseConfigured,
  readSupabaseEnv,
  requireSupabaseEnv,
  supabaseProjectRef,
} from "@/lib/supabase/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(url?: string, key?: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", key ?? "");
}

describe("readSupabaseEnv", () => {
  it("둘 다 있으면 값을 돌려준다", () => {
    configure("https://abcd.supabase.co", "sb_publishable_x");
    expect(readSupabaseEnv()).toEqual({
      url: "https://abcd.supabase.co",
      publishableKey: "sb_publishable_x",
    });
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("하나라도 비면 미설정으로 본다", () => {
    configure("https://abcd.supabase.co", "");
    expect(readSupabaseEnv()).toBeNull();

    configure("", "sb_publishable_x");
    expect(readSupabaseEnv()).toBeNull();
  });
});

describe("requireSupabaseEnv", () => {
  it("미설정이면 무엇을 해야 하는지 알려주는 오류를 던진다", () => {
    configure("", "");
    // 스택만 보고 원인을 찾을 수 있어야 한다.
    expect(() => requireSupabaseEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => requireSupabaseEnv()).toThrow(/supabase\/README\.md/);
  });
});

describe("allowsUnconfiguredAuth", () => {
  it("개발·테스트에서는 미설정 상태를 허용한다", () => {
    expect(allowsUnconfiguredAuth("development")).toBe(true);
    expect(allowsUnconfiguredAuth("test")).toBe(true);
    expect(allowsUnconfiguredAuth(undefined)).toBe(true);
  });

  it("운영에서는 절대 허용하지 않는다", () => {
    // 환경변수가 빠진 채 배포되면 인증 검사가 통째로 사라진다.
    // 조용히 열리느니 요청이 실패해야 한다.
    expect(allowsUnconfiguredAuth("production")).toBe(false);
  });
});

describe("supabaseProjectRef", () => {
  it("URL 에서 프로젝트 ref 를 뽑는다", () => {
    expect(supabaseProjectRef("https://abcdefgh.supabase.co")).toBe("abcdefgh");
  });

  it("URL 이 아니면 null 을 돌려준다", () => {
    expect(supabaseProjectRef("not-a-url")).toBeNull();
    expect(supabaseProjectRef("")).toBeNull();
  });
});
