"use client";

import { createBrowserClient } from "@supabase/ssr";

import { requireSupabaseEnv } from "@/lib/supabase/env";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | undefined;

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * 모듈 최상위가 아니라 호출 시점에 만든다. 최상위에서 만들면 환경변수가 없는
 * 상태에서 모듈을 import 하는 것만으로 렌더링이 통째로 터진다.
 * 클라이언트는 한 번만 만들어 재사용한다 — 매번 새로 만들면 인증 상태 구독이
 * 중복되고 토큰 갱신 요청이 늘어난다.
 */
export function getSupabaseBrowserClient(): BrowserClient {
  if (!cached) {
    const env = requireSupabaseEnv();
    cached = createBrowserClient(env.url, env.publishableKey);
  }
  return cached;
}
