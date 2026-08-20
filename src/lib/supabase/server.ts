import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { requireSupabaseEnv } from "@/lib/supabase/env";

/**
 * 서버(Server Component / Route Handler / Server Action)용 Supabase 클라이언트.
 *
 * 요청마다 새로 만든다. 모듈 스코프에 캐시하면 한 사용자의 세션이 다른 요청으로
 * 새어 나간다.
 */
export async function createSupabaseServerClient() {
  const env = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    // 앱 테이블은 public 이 아니라 trip 스키마에 있다.
    db: { schema: "trip" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component 는 쿠키를 쓸 수 없다. 토큰 갱신은 proxy 가 담당하므로
          // 여기서는 무시해도 세션이 유지된다.
        }
      },
    },
  });
}

/**
 * 서비스 역할 클라이언트 — RLS 를 우회한다.
 *
 * 공유 링크 검증처럼 RLS 로 표현할 수 없는 경로에서만 쓴다.
 * 일반 요청 경로에서 이걸 쓰면 RLS 전체가 무력화되므로, 사용처를 늘리기 전에
 * docs/architecture.md 6절의 격리 규칙을 확인할 것.
 */
export function createSupabaseServiceRoleClient() {
  const env = requireSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 이 키는 서버 전용이며 " +
        "NEXT_PUBLIC_ 접두사를 붙이면 안 됩니다.",
    );
  }

  return createServerClient(env.url, serviceRoleKey, {
    db: { schema: "trip" },
    // 서비스 역할은 사용자 세션과 무관하다. 쿠키를 읽지도 쓰지도 않는다.
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}
