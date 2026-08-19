import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { requiresAuth } from "@/lib/auth/paths";
import { buildLoginUrl } from "@/lib/auth/redirect";
import { allowsUnconfiguredAuth, readSupabaseEnv } from "@/lib/supabase/env";

/**
 * Next.js 16 에서 `middleware` 규약은 `proxy` 로 바뀌었다.
 * 런타임은 nodejs 로 고정이며 edge 는 지원하지 않는다.
 *
 * 여기서 하는 일은 두 가지다.
 *   1. 만료가 임박한 세션 토큰을 갱신하고 응답 쿠키에 반영한다.
 *      Server Component 는 쿠키를 쓸 수 없으므로 이 갱신을 대신할 곳이 없다.
 *   2. 보호된 경로에 로그인하지 않고 접근하면 로그인 페이지로 보낸다.
 */

function redirectWithCookies(url: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

function redirectToLogin(request: NextRequest, response = NextResponse.next()) {
  const target = buildLoginUrl(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  return redirectWithCookies(new URL(target, request.url), response);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const env = readSupabaseEnv();

  if (!env) {
    if (!allowsUnconfiguredAuth()) {
      // 운영에서 환경변수가 빠지면 인증 검사가 통째로 사라진다.
      // 조용히 통과시키느니 요청을 실패시키는 편이 안전하다.
      throw new Error(
        "Supabase 환경변수가 없습니다. 운영 환경에서는 인증 없이 동작할 수 없습니다.",
      );
    }
    // 개발 중 미설정 상태: 항상 로그아웃으로 취급한다.
    return requiresAuth(pathname) ? redirectToLogin(request) : NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 갱신된 쿠키를 요청과 응답 양쪽에 반영해야 한다.
        // 요청에만 넣으면 브라우저가 새 토큰을 못 받고, 응답에만 넣으면
        // 이번 요청의 렌더링이 옛 토큰을 본다.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  let isAuthenticated = false;
  try {
    // getUser() 는 토큰을 검증하고 필요하면 갱신한다.
    // getSession() 은 쿠키 값을 그대로 믿으므로 접근 제어에 쓰면 안 된다.
    const { data, error } = await supabase.auth.getUser();
    isAuthenticated = !error && Boolean(data.user);
  } catch {
    // Supabase 가 응답하지 않으면 로그아웃으로 취급한다.
    // 열어주는 쪽으로 실패하면 장애가 곧 인증 우회가 된다.
    isAuthenticated = false;
  }

  if (!isAuthenticated && requiresAuth(pathname)) {
    return redirectToLogin(request, response);
  }

  if (isAuthenticated && pathname === "/login") {
    return redirectWithCookies(new URL("/", request.url), response);
  }

  return response;
}

export const config = {
  /*
   * matcher 를 지정하지 않으면 정적 파일과 이미지 최적화 요청까지 전부 통과하며,
   * 인증 리다이렉트가 CSS·JS 로딩을 막아버린다.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
