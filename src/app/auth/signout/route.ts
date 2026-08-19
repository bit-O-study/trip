import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 로그아웃.
 *
 * POST 만 받는다. GET 으로 로그아웃할 수 있으면 `<img src="/auth/signout">` 같은
 * 것만으로 남을 로그아웃시킬 수 있다.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // 이미 로그아웃 상태이거나 설정이 없는 경우. 어차피 로그인 페이지로 보낸다.
  }

  return NextResponse.redirect(new URL("/login", request.url), {
    // 303 이어야 브라우저가 POST 를 GET 으로 바꿔 따라간다.
    status: 303,
  });
}
