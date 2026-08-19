import { NextResponse } from "next/server";
import { z } from "zod";

import { PlaceSearchError, searchPlaces } from "@/features/places/kakao";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 장소 검색.
 *
 * 브라우저가 Kakao 를 직접 부르지 않는다. REST 키는 서버 전용이고,
 * 응답 캐싱과 속도 제한도 여기서 한다.
 */

const searchParamsSchema = z.object({
  q: z.string().trim().min(1, "검색어를 입력하세요").max(80),
  page: z.coerce.number().int().min(1).max(3).default(1),
  category: z.enum(["FD6", "CE7", "AD5", "AT4"]).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

/*
 * 사용자 한 명이 Kakao 일일 쿼터를 태우지 못하게 한다.
 * 쿼터가 소진되면 그 순간부터 모든 사용자의 검색이 죽는다.
 */
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const rate = limiter.check(auth.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "검색이 너무 잦습니다. 잠시 후 다시 시도하세요." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) },
      },
    );
  }

  const url = new URL(request.url);
  const parsed = searchParamsSchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    page: url.searchParams.get("page") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    lat: url.searchParams.get("lat") ?? undefined,
    lng: url.searchParams.get("lng") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "요청이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  const { q, page, category, lat, lng } = parsed.data;

  try {
    const result = await searchPlaces({
      query: q,
      page,
      categoryGroupCode: category,
      center: lat !== undefined && lng !== undefined ? { latitude: lat, longitude: lng } : undefined,
    });

    return NextResponse.json(result, {
      // 검색 결과는 사용자별로 다르지 않지만 인증이 필요한 경로이므로
      // 공유 캐시에 남기지 않는다. 상위 캐싱은 fetch 레이어가 담당한다.
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PlaceSearchError) {
      /*
       * degraded mode — 검색만 막히고 저장된 일정 조회와 수동 입력은 계속
       * 동작해야 한다. 그래서 500 이 아니라 상황에 맞는 코드를 돌려주고
       * 화면이 "직접 입력" 으로 안내하게 한다.
       */
      const status =
        error.kind === "not_configured" ? 503 : error.kind === "quota" ? 429 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }
    throw error;
  }
}
