import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/rate-limit";

describe("createRateLimiter", () => {
  it("한도까지는 통과시킨다", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check("a", 0).allowed).toBe(true);
    }
  });

  it("한도를 넘으면 막는다", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.check("a", 0);
    limiter.check("a", 0);

    const blocked = limiter.check("a", 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(1000);
  });

  it("창이 지나면 다시 통과시킨다", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 500).allowed).toBe(false);
    expect(limiter.check("a", 1001).allowed).toBe(true);
  });

  it("창이 미끄러진다 — 고정 구간이 아니다", () => {
    // 고정 창이면 경계에서 두 배가 한꺼번에 통과한다.
    // 창은 [t, t + windowMs) 이므로 정확히 windowMs 지난 기록은 이미 만료다.
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    limiter.check("a", 0);
    limiter.check("a", 900);

    expect(limiter.check("a", 999).allowed).toBe(false); // 0 시점 것이 아직 유효
    expect(limiter.check("a", 1000).allowed).toBe(true); // 0 시점 것이 빠짐
  });

  it("키마다 따로 센다", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
  });

  it("남은 횟수를 알려준다", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.check("a", 0).remaining).toBe(2);
    expect(limiter.check("a", 0).remaining).toBe(1);
    expect(limiter.check("a", 0).remaining).toBe(0);
  });

  it("만료된 기록을 정리한다", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.check("a", 0);
    limiter.prune(2000);
    // 정리 후에는 한도가 초기화된 것처럼 동작해야 한다.
    expect(limiter.check("a", 2000).allowed).toBe(true);
  });
});
