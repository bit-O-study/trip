import { afterEach, describe, expect, it, vi } from "vitest";

import { getExchangeRate, parseQuote, secondsUntilNextMorning } from "./rates";

describe("secondsUntilNextMorning", () => {
  it("아침 6시(한국) 전이면 오늘 아침까지", () => {
    // 한국 05:00 = UTC 전날 20:00 → 1시간
    expect(secondsUntilNextMorning(new Date("2026-11-02T20:00:00Z"))).toBe(3600);
  });

  it("아침 6시를 지났으면 다음 날 아침까지", () => {
    // 한국 09:00 = UTC 00:00 → 21시간
    expect(secondsUntilNextMorning(new Date("2026-11-03T00:00:00Z"))).toBe(21 * 3600);
  });

  it("정각 6시에는 다음 날 아침까지(24시간)", () => {
    expect(secondsUntilNextMorning(new Date("2026-11-02T21:00:00Z"))).toBe(24 * 3600);
  });
});

describe("parseQuote", () => {
  const ok = { result: "success", time_last_update_unix: 1762128000, rates: { KRW: 46.2, JPY: 110 } };

  it("필요한 통화의 환율과 갱신 시각을 꺼낸다", () => {
    expect(parseQuote(ok, "TWD", "KRW")).toEqual({ from: "TWD", to: "KRW", rate: 46.2, updatedAt: "2025-11-03T00:00:00.000Z" });
  });

  it("실패 응답·없는 통화·이상한 값은 null", () => {
    expect(parseQuote({ result: "error" }, "TWD", "KRW")).toBeNull();
    expect(parseQuote(ok, "TWD", "XXX")).toBeNull();
    expect(parseQuote({ ...ok, rates: { KRW: -1 } }, "TWD", "KRW")).toBeNull();
    expect(parseQuote(null, "TWD", "KRW")).toBeNull();
  });
});

describe("getExchangeRate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("공급자 응답을 환율로 돌려주고 아침까지 캐시하도록 요청한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "success", rates: { KRW: 46.2 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const quote = await getExchangeRate("twd");
    expect(quote).toMatchObject({ from: "TWD", to: "KRW", rate: 46.2 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://open.er-api.com/v6/latest/TWD");
    expect(init.next.revalidate).toBeGreaterThanOrEqual(60);
    expect(init.next.tags).toContain("exchange-rates");
  });

  it("네트워크 오류나 비정상 응답에도 던지지 않고 null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await getExchangeRate("TWD")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await getExchangeRate("TWD")).toBeNull();
  });

  it("통화 코드가 올바르지 않으면 요청하지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getExchangeRate("../x")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("같은 통화는 1 이다", async () => {
    expect(await getExchangeRate("KRW", "KRW")).toMatchObject({ rate: 1 });
  });
});
