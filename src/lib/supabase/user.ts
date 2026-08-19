import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
};

/**
 * 현재 로그인한 사용자. 로그인하지 않았거나 확인할 수 없으면 null.
 *
 * 절대 예외를 던지지 않는다. 레이아웃처럼 모든 페이지가 거치는 곳에서 쓰이므로,
 * Supabase 가 잠깐 응답하지 않는다고 앱 전체가 500 이 되면 안 된다.
 *
 * 이 함수는 화면 표시용이다. **접근 제어에 쓰지 않는다** — 그것은 proxy 와
 * RLS 의 책임이다.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
