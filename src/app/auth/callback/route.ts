import { NextResponse } from "next/server";

import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * 리다이렉트에 쓸 출처.
 *
 * Vercel 처럼 프록시 뒤에 있으면 request.url 의 host 가 내부 주소라
 * x-forwarded-host 를 봐야 한다. 그런데 이 헤더는 클라이언트가 보낼 수도 있다.
 * 그대로 믿으면 세션 교환 직후 공격자 도메인으로 보내는 오픈 리다이렉트가 된다.
 * 배포 설정에서 온 호스트(허용 목록)와 일치할 때만 쓴다.
 */
function resolveOrigin(request: Request, url: URL): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const allowed = new Set(
    [
      url.host.toLowerCase(),
      hostOf(siteUrl),
      hostOf(process.env.VERCEL_URL),
      hostOf(process.env.VERCEL_BRANCH_URL),
      hostOf(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      ...(process.env.AUTH_TRUSTED_HOSTS ?? "").split(",").map((host) => hostOf(host.trim())),
    ].filter((host): host is string => Boolean(host)),
  );

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedHost && allowed.has(forwardedHost)) {
    const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const scheme = proto === "http" || proto === "https" ? proto : url.protocol.replace(":", "");
    return `${scheme}://${forwardedHost}`;
  }

  // 모르는 호스트면 설정된 사이트 주소로, 그것도 없으면 요청 자체의 출처로.
  if (forwardedHost && siteUrl) {
    try {
      return new URL(siteUrl).origin;
    } catch {
      // 잘못된 설정이면 아래로.
    }
  }
  return url.origin;
}

/**
 * OAuth / 매직링크 콜백.
 *
 * 공급자가 붙여 보낸 code 를 세션으로 교환하고, 원래 가려던 경로로 돌려보낸다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));
  const origin = resolveOrigin(request, url);

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
