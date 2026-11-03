/**
 * 슬라이딩 윈도우 속도 제한.
 *
 * 한 사용자가 검색을 연타해 Kakao 일일 쿼터를 태우는 것을 막는다.
 * 쿼터가 소진되면 그 순간부터 **모든 사용자**의 검색이 죽으므로, 한 명이
 * 전체를 망가뜨리지 못하게 하는 것이 목적이다.
 *
 * ⚠ 한계 — 보안 경계로 믿지 않는다 (보안 점검 2026-10-23).
 *
 *   - 프로세스 메모리에만 산다. Vercel 서버리스는 요청마다 인스턴스가 다를 수
 *     있고 콜드 스타트마다 비워지므로, 실제 허용량은 `limit × 동시 인스턴스 수`
 *     이고 분산된 공격에는 사실상 효과가 없다.
 *   - 키는 x-forwarded-for 첫 값이다. Vercel 은 이 헤더를 자기 값으로 덮어
 *     쓰지만, 다른 프록시 뒤에 두면 클라이언트가 위조할 수 있다.
 *
 * 그래서 쓰는 곳은 "실수로 연타해 외부 API 쿼터를 태우는 것" 을 늦추는 용도에
 * 한정한다. 공유 링크 토큰 대입은 이 제한이 아니라 토큰 엔트로피(32바이트
 * 무작위, 해시 비교)가 막는다. 전역으로 정확한 제한이 필요해지면 DB 테이블
 * (예: trip_private.rate_limits + 원자적 upsert) 이나 Upstash 로 옮긴다 — 지금은
 * 검색마다 DB 왕복을 하나 더 늘리는 비용이 이득보다 크다고 판단했다.
 */

export type RateLimitResult = {
  allowed: boolean;
  /** 남은 허용 횟수 */
  remaining: number;
  /** 다시 시도 가능한 시각까지 남은 밀리초. allowed 면 0. */
  retryAfterMs: number;
};

export type RateLimiter = {
  check: (key: string, now?: number) => RateLimitResult;
  /** 테스트와 장기 실행 프로세스를 위한 정리 */
  prune: (now?: number) => void;
};

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  /** 메모리가 무한히 늘지 않도록 추적할 키 수를 제한한다. */
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  const hits = new Map<string, number[]>();

  const prune = (now = Date.now()) => {
    for (const [key, times] of hits) {
      const kept = times.filter((t) => now - t < windowMs);
      if (kept.length === 0) hits.delete(key);
      else hits.set(key, kept);
    }
  };

  return {
    prune,
    check(key, now = Date.now()) {
      const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

      if (times.length >= limit) {
        const oldest = times[0];
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, windowMs - (now - oldest)),
        };
      }

      times.push(now);
      hits.set(key, times);

      // 키가 너무 많이 쌓이면 오래된 것부터 정리한다.
      if (hits.size > maxKeys) prune(now);

      return { allowed: true, remaining: limit - times.length, retryAfterMs: 0 };
    },
  };
}
