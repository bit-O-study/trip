import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 로그아웃.
 *
 * POST 만 받는다. GET 으로 로그아웃할 수 있으면 `<img src="/auth/signout">` 같은
 * 것만으로 남을 로그아웃시킬 수 있다.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // 이미 로그아웃 상태이거나 설정이 없는 경우. 어차피 로그인 페이지로 보낸다.
  }

  // 프록시 뒤의 request.url 은 내부 서버 주소일 수 있다. 상대 Location 으로
  // 보내야 WebView 도 현재 공개 출처를 유지하며 로그인 화면을 연다.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/login" },
  });
}
