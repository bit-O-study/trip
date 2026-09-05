import { NextResponse } from "next/server";
import { z } from "zod";

import { aeroDataBoxProvider } from "@/features/flights/aerodatabox";
import { kacGwProvider } from "@/features/flights/kac-gw";
import { FlightSearchError, normalizeFlightNumber, searchFlights } from "@/features/flights/provider";
import { createRateLimiter } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 편명 + 출발일로 항공편을 찾는다.
 *
 * 공급자 키는 서버 전용이라 브라우저가 직접 부르지 않는다.
 *
 * 순서는 AeroDataBox → 한국공항공사다. 계획 단계에서 필요한 것은 몇 주~몇 달
 * 뒤의 스케줄인데 한국공항공사 GW 는 이름 그대로 실시간 운항정보라 미래
 * 스케줄에 답하지 못할 가능성이 높다 (ADR-0001 검증 항목 4).
 */
const PROVIDERS = [aeroDataBoxProvider, kacGwProvider] as const;

const limiter = createRateLimiter({ limit: 20, windowMs: 60_000 });

const paramsSchema = z.object({
  flightNumber: z.string().trim().min(2).max(12),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "출발일을 선택하세요"),
});

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const rate = limiter.check(auth.user.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "조회가 너무 잦습니다. 잠시 후 다시 시도하세요." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(request.url);
  const parsed = paramsSchema.safeParse({
    flightNumber: url.searchParams.get("flightNumber") ?? "",
    date: url.searchParams.get("date") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "요청이 올바르지 않습니다" },
      { status: 400 },
    );
  }

  const normalized = normalizeFlightNumber(parsed.data.flightNumber);
  if (!normalized) {
    return NextResponse.json(
      { error: "편명을 확인하세요. 예: KE703", kind: "not_found" },
      { status: 400 },
    );
  }

  try {
    const { results } = await searchFlights(PROVIDERS, {
      flightNumberKey: normalized.key,
      departureDate: parsed.data.date,
    });
    return NextResponse.json(
      { results, flightNumberInput: normalized.input },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof FlightSearchError) {
      /*
       * degraded mode — 조회가 막혀도 수동 입력은 계속 살아 있어야 한다.
       * 화면이 그 사실을 안내할 수 있도록 kind 를 함께 돌려준다.
       */
      const status =
        error.kind === "not_configured" ? 503 : error.kind === "quota" ? 429 : 502;
      return NextResponse.json({ error: error.message, kind: error.kind }, { status });
    }
    throw error;
  }
}
