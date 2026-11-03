/**
 * 환율(참고용). 정산 기준이 아니다.
 *
 * docs/architecture.md 는 다중 통화 정산에 "여행 시작일 환율 스냅샷" 을 쓰라고 한다.
 * 여기서 가져오는 값은 화면에 보여 주는 오늘의 참고 환율이며 어디에도 저장하지 않는다.
 *
 * 공급자: ExchangeRate-API 의 무료 공개 엔드포인트(open.er-api.com). 키가 필요 없고
 * 160여 통화(TWD·VND 포함)를 하루 한 번 갱신한다. 이용 조건상 출처를 표시해야 한다.
 *
 * "아침마다 가져오기": 별도 스케줄러 없이 Next 의 서버 fetch 캐시를 다음 날 06:00(한국 시간)까지
 * 유지한다. 그 시각 이후 첫 방문이 새 환율을 가져오고, 그 뒤로는 다음 아침까지 같은 값을 쓴다.
 */

export type ExchangeQuote = {
  from: string;
  to: string;
  /** 1 from 이 몇 to 인가 */
  rate: number;
  /** 공급자가 이 환율을 갱신한 시각(ISO) */
  updatedAt: string;
};

const ENDPOINT = "https://open.er-api.com/v6/latest";
const CODE = /^[A-Z]{3}$/;
/** 한국 시간 기준 아침. 서머타임이 없어 +9 시간 고정이다. */
const REFRESH_HOUR_KST = 6;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_SECONDS = 60;

/**
 * 다음 아침(06:00 KST)까지 남은 초. 캐시 수명으로 쓴다.
 * 너무 짧으면 같은 순간 요청이 몰릴 수 있어 최소 1분은 둔다.
 */
export function secondsUntilNextMorning(now: Date = new Date()): number {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const next = new Date(kst);
  next.setUTCHours(REFRESH_HOUR_KST, 0, 0, 0);
  if (next.getTime() <= kst.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return Math.max(MIN_SECONDS, Math.round((next.getTime() - kst.getTime()) / 1000));
}

/** 공급자 응답에서 필요한 값만 꺼낸다. 형식이 다르면 null. */
export function parseQuote(payload: unknown, from: string, to: string): ExchangeQuote | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as { result?: unknown; rates?: Record<string, unknown>; time_last_update_unix?: unknown };
  if (body.result !== "success" || !body.rates) return null;
  const rate = body.rates[to];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) return null;
  const unix = typeof body.time_last_update_unix === "number" ? body.time_last_update_unix : null;
  return { from, to, rate, updatedAt: new Date((unix ?? Date.now() / 1000) * 1000).toISOString() };
}

/**
 * `from` 1 단위가 `to` 로 얼마인지. 가져오지 못하면 null 이다(화면은 환율 영역만 숨긴다).
 * 외부 서비스 장애가 여행 화면 전체를 막아서는 안 되므로 절대 던지지 않는다.
 */
export async function getExchangeRate(from: string, to = "KRW"): Promise<ExchangeQuote | null> {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (!CODE.test(source) || !CODE.test(target)) return null;
  if (source === target) return { from: source, to: target, rate: 1, updatedAt: new Date().toISOString() };

  try {
    const response = await fetch(`${ENDPOINT}/${source}`, {
      next: { revalidate: secondsUntilNextMorning(), tags: ["exchange-rates"] },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return parseQuote(await response.json(), source, target);
  } catch {
    return null;
  }
}
