import { NextResponse } from "next/server";
import { z } from "zod";

import { searchAirports } from "@/features/flights/airport-search";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 공항 이름·도시·코드 → IATA 코드(내장 데이터). 외부 호출이 없지만 로그인 사용자에게만 연다. */
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
const querySchema = z.string().trim().min(2, "두 글자 이상 입력하세요").max(60);

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });

  const rate = limiter.check(auth.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "검색이 너무 잦습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "검색어가 올바르지 않습니다" }, { status: 400 });
  }

  return NextResponse.json(
    { airports: searchAirports(parsed.data) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
