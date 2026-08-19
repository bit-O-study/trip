/**
 * 슬라이딩 윈도우 속도 제한.
 *
 * 한 사용자가 검색을 연타해 Kakao 일일 쿼터를 태우는 것을 막는다.
 * 쿼터가 소진되면 그 순간부터 **모든 사용자**의 검색이 죽으므로, 한 명이
 * 전체를 망가뜨리지 못하게 하는 것이 목적이다.
 *
 * 한계: 프로세스 메모리에만 산다. 서버 인스턴스가 여러 개면 인스턴스마다
 * 따로 센다. 정확한 전역 제한이 필요해지면 Vercel KV 나 Upstash 로 옮긴다.
 * 지금 단계에서는 연타를 막는 것으로 충분하다.
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
