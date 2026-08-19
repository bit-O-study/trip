import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth / 매직링크 콜백.
 *
 * 공급자가 붙여 보낸 code 를 세션으로 교환하고, 원래 가려던 경로로 돌려보낸다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));

  /*
   * Vercel 처럼 프록시 뒤에 있으면 request.url 의 host 가 내부 주소다.
   * 리다이렉트 대상은 사용자가 실제로 보고 있는 호스트여야 한다.
   */
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=missing_code`);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=exchange_failed`);
    }
  } catch {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=not_configured`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
