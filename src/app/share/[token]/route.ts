import { NextResponse } from "next/server";

import { isShareReadable, redeemShareToken } from "@/features/share/server";
import { SHARE_COOKIE, SHARE_COOKIE_MAX_AGE_SECONDS } from "@/features/share/types";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * 공유 토큰 검증 전용 경로.
 *
 * 여기서 하는 일은 "토큰을 URL 밖으로 옮기는 것" 하나다.
 *
 * 경로에 실린 토큰은 접근 로그·브라우저 방문 기록·Referrer 헤더에 그대로
 * 남으므로 비밀로 취급할 수 없다. 그래서 최초 1회만 검증하고 곧바로
 * HttpOnly 쿠키로 옮긴 뒤 토큰 없는 주소(`/s/[shortId]`)로 보낸다
 * (docs/architecture.md §6 "토큰이 로그·기록에 남는 문제").
 *
 * 쿠키에 원본 토큰을 담는 이유: 별도 서명 비밀 없이도 매 요청 해시로 다시
 * 검증할 수 있고, 폐기·만료가 즉시 반영된다. HttpOnly 라 스크립트는 못 읽고
 * 주소창·기록·Referrer 어디에도 남지 않는다.
 */

/* 토큰 대입 시도를 늦춘다. 로그인 경로가 아니라 IP 로 센다. */
const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = new URL(request.url).origin;

  function bounce(reason: "invalid" | "unconfigured") {
    const response = NextResponse.redirect(`${origin}/share/invalid?reason=${reason}`, {
      status: 302,
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  /*
   * 키가 없으면 링크는 발급됐는데 아무도 못 여는 상태다. 공개 경로에서
   * 스택 트레이스와 함께 500 을 내는 대신, 운영자가 로그로 원인을 보고
   * 방문자는 평범한 안내를 받게 한다.
   */
  if (!isShareReadable()) {
    console.warn(
      "[share] SUPABASE_SERVICE_ROLE_KEY 가 없어 공유 링크를 열 수 없습니다. .env 를 확인하세요.",
    );
    return bounce("unconfigured");
  }

  if (!limiter.check(clientKey(request)).allowed) return bounce("invalid");

  const grant = await redeemShareToken(token);
  if (!grant) return bounce("invalid");

  const response = NextResponse.redirect(`${origin}/s/${grant.shortId}`, { status: 302 });
  response.cookies.set(SHARE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SHARE_COOKIE_MAX_AGE_SECONDS,
  });
  // 토큰이 실린 이 응답은 어디에도 저장되면 안 된다.
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
