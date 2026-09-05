import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeAeroFlight } from "@/features/flights/aerodatabox";
import { airportTimezone } from "@/features/flights/airports";
import { kacTimeToUtc, normalizeKacItem } from "@/features/flights/kac-gw";
import {
  FlightSearchError,
  normalizeFlightNumber,
  searchFlights,
  type FlightProvider,
  type FlightSearchResult,
} from "@/features/flights/provider";

describe("normalizeFlightNumber", () => {
  /*
   * 선행 0 을 지우는 것이 핵심이다. 지우지 않으면 같은 항공편이 "KE0703" 과
   * "KE703" 두 행으로 갈라져 중복 감지가 통째로 무력해진다.
   */
  it.each([
    ["KE 0703", "KE703"],
    ["ke703", "KE703"],
    ["KE-0703", "KE703"],
    ["  oz102  ", "OZ102"],
    ["7C1234", "7C1234"],
    ["KAL0703", "KAL703"],
  ])("%s → %s", (input, key) => {
    expect(normalizeFlightNumber(input)?.key).toBe(key);
  });

  it("표시용 원문은 그대로 남긴다", () => {
    expect(normalizeFlightNumber("KE 0703")?.input).toBe("KE 0703");
  });

  it.each(["", "703", "KE", "K", "KE70345", "!!"])("%s 는 편명이 아니다", (input) => {
    expect(normalizeFlightNumber(input)).toBeNull();
  });
});

describe("airportTimezone", () => {
  it("아는 공항은 IANA 이름을 준다", () => {
    expect(airportTimezone("icn")).toBe("Asia/Seoul");
    expect(airportTimezone("NRT")).toBe("Asia/Tokyo");
    expect(airportTimezone("JFK")).toBe("America/New_York");
  });

  // 모르는 공항을 UTC 로 채우면 그 항공편의 모든 시각이 조용히 어긋난다.
  it("모르는 공항은 지어내지 않는다", () => {
    expect(airportTimezone("ZZZ")).toBeNull();
    expect(airportTimezone(null)).toBeNull();
  });
});

describe("kacTimeToUtc", () => {
  // 이 API 는 시간대 표기 없이 한국 시각을 준다. UTC 로 읽으면 9시간 밀린다.
  it("KST 벽시계를 UTC 로 옮긴다", () => {
    expect(kacTimeToUtc("202602140820")).toBe("2026-02-13T23:20:00.000Z");
  });

  it("읽을 수 없는 값은 null", () => {
    expect(kacTimeToUtc(undefined)).toBeNull();
    expect(kacTimeToUtc("2026")).toBeNull();
  });
});

describe("normalizeKacItem", () => {
  it("도착 공항 시간대를 모르면 버린다", () => {
    const result = normalizeKacItem(
      { flightId: "KE703", scheduleDateTime: "202602140820", airportCode: "ZZZ" },
      "KE703",
      "ICN",
    );
    expect(result).toBeNull();
  });

  it("아는 공항이면 출발·도착 시간대를 각각 채운다", () => {
    const result = normalizeKacItem(
      { flightId: "KE703", scheduleDateTime: "202602140820", airportCode: "NRT", remark: "지연" },
      "KE703",
      "ICN",
    );
    expect(result).toMatchObject({
      provider: "kac_gw",
      status: "delayed",
      departure: { airport: "ICN", timezone: "Asia/Seoul" },
      arrival: { airport: "NRT", timezone: "Asia/Tokyo" },
    });
  });
});

describe("normalizeAeroFlight", () => {
  const flight = {
    number: "KE 703",
    status: "Expected",
    airline: { name: "Korean Air", iata: "KE" },
    departure: {
      airport: { iata: "ICN", timeZone: "Asia/Seoul" },
      terminal: "2",
      scheduledTime: { utc: "2026-02-13 23:20Z" },
    },
    arrival: {
      airport: { iata: "NRT", timeZone: "Asia/Tokyo" },
      scheduledTime: { utc: "2026-02-14 01:40Z" },
    },
  };

  it("공급자가 준 시간대를 그대로 쓴다", () => {
    const result = normalizeAeroFlight(flight, "KE703");
    expect(result).toMatchObject({
      provider: "aerodatabox",
      marketingFlightNumber: "KE703",
      status: "scheduled",
      departure: { airport: "ICN", terminal: "2", timezone: "Asia/Seoul" },
      arrival: { airport: "NRT", timezone: "Asia/Tokyo" },
    });
  });

  // 출발이나 도착 하나를 못 읽으면 일정으로 쓸 수 없다. 반쪽을 만들지 않는다.
  it("도착 정보가 없으면 버린다", () => {
    expect(normalizeAeroFlight({ ...flight, arrival: undefined }, "KE703")).toBeNull();
  });

  it("운항 편명이 판매 편명과 같으면 코드셰어로 표시하지 않는다", () => {
    const result = normalizeAeroFlight({ ...flight, callSign: "KE703" }, "KE703");
    expect(result?.operatingFlightNumber).toBeNull();
  });
});

function stubProvider(
  id: FlightProvider["id"],
  configured: boolean,
  behavior: () => Promise<FlightSearchResult[]>,
): FlightProvider {
  return { id, label: id, isConfigured: () => configured, search: behavior };
}

const HIT = [{ marketingFlightNumber: "KE703" } as FlightSearchResult];

describe("searchFlights", () => {
  beforeEach(() => vi.clearAllMocks());

  it("설정된 공급자가 하나도 없으면 not_configured 로 알린다", async () => {
    await expect(
      searchFlights([stubProvider("kac_gw", false, async () => [])], {
        flightNumberKey: "KE703",
        departureDate: "2026-02-14",
      }),
    ).rejects.toMatchObject({ kind: "not_configured" });
  });

  /*
   * "첫 공급자가 못 찾음" 은 흔한 정상 상황이다 — 국내선은 한국공항공사가,
   * 해외 노선은 AeroDataBox 가 답한다. 여기서 멈추면 절반이 검색되지 않는다.
   */
  it("앞 공급자가 비면 다음 공급자로 넘어간다", async () => {
    const second = vi.fn().mockResolvedValue(HIT);
    const { results, tried } = await searchFlights(
      [
        stubProvider("aerodatabox", true, async () => []),
        stubProvider("kac_gw", true, second),
      ],
      { flightNumberKey: "KE703", departureDate: "2026-02-14" },
    );
    expect(results).toEqual(HIT);
    expect(tried).toEqual(["aerodatabox", "kac_gw"]);
  });

  it("앞 공급자가 실패해도 다음 공급자가 찾으면 성공이다", async () => {
    const { results } = await searchFlights(
      [
        stubProvider("aerodatabox", true, async () => {
          throw new FlightSearchError("죽었음", "upstream");
        }),
        stubProvider("kac_gw", true, async () => HIT),
      ],
      { flightNumberKey: "KE703", departureDate: "2026-02-14" },
    );
    expect(results).toEqual(HIT);
  });

  it("전부 실패하면 마지막 오류를 올린다", async () => {
    await expect(
      searchFlights(
        [
          stubProvider("aerodatabox", true, async () => {
            throw new FlightSearchError("한도 초과", "quota");
          }),
        ],
        { flightNumberKey: "KE703", departureDate: "2026-02-14" },
      ),
    ).rejects.toMatchObject({ kind: "quota" });
  });

  it("설정되지 않은 공급자는 아예 호출하지 않는다", async () => {
    const never = vi.fn();
    const { tried } = await searchFlights(
      [stubProvider("kac_gw", false, never), stubProvider("aerodatabox", true, async () => HIT)],
      { flightNumberKey: "KE703", departureDate: "2026-02-14" },
    );
    expect(never).not.toHaveBeenCalled();
    expect(tried).toEqual(["aerodatabox"]);
  });
});
