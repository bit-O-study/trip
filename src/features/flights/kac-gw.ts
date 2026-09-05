import { airportTimezone } from "@/features/flights/airports";
import {
  FlightSearchError,
  type FlightProvider,
  type FlightSearchInput,
  type FlightSearchResult,
  type FlightStatus,
} from "@/features/flights/provider";

/**
 * 한국공항공사 실시간 항공기 운항정보 조회 GW 어댑터 (ADR-0001 후보 A).
 *
 * ⚠ **두 가지를 반드시 알고 써야 한다.**
 *
 * 1. 기존 `한국공항공사_항공기 운항정보` API 는 2026-06-12 공지로 폐기됐고 이
 *    GW API 로 전환됐다. 인터넷의 예제 대부분은 폐기된 엔드포인트를 가리킨다.
 * 2. 이름 그대로 **실시간** 운항정보다. 몇 달 뒤 항공편을 찾는 계획 단계에는
 *    답하지 못할 가능성이 높다(ADR-0001 검증 항목 4). 그래서 이 공급자는
 *    AeroDataBox 보다 **뒤에** 둔다.
 *
 * 활용 신청 승인과 실제 샘플 응답 확인 전까지 이 매핑은 검증되지 않았다.
 * 응답 필드가 다르면 여기만 고치면 된다 — 화면과 저장 경로는 provider.ts 의
 * 타입에만 의존한다.
 */

const ENDPOINT =
  "http://apis.data.go.kr/B551177/StatusOfPassengerFlightsDSOdp/getPassengerDeparturesDSOdp";

type KacItem = {
  airline?: string;
  flightId?: string;
  airport?: string;
  airportCode?: string;
  scheduleDateTime?: string;
  estimatedDateTime?: string;
  terminalId?: string;
  gatenumber?: string;
  remark?: string;
};

const STATUS: Array<[RegExp, FlightStatus]> = [
  [/결항|CANCEL/i, "cancelled"],
  [/지연|DELAY/i, "delayed"],
  [/탑승|BOARD/i, "boarding"],
  [/출발|DEPART/i, "departed"],
  [/도착|ARRIV/i, "landed"],
  [/회항|DIVERT/i, "diverted"],
];

function toStatus(remark: string | undefined): FlightStatus {
  if (!remark?.trim()) return "scheduled";
  for (const [pattern, status] of STATUS) {
    if (pattern.test(remark)) return status;
  }
  return "unknown";
}

/**
 * "202602140820" (KST 벽시계) → UTC ISO.
 *
 * 이 API 의 시각은 시간대 표기 없이 한국 시각으로 온다. UTC 로 읽으면 9시간이
 * 통째로 밀린다.
 */
export function kacTimeToUtc(value: string | undefined): string | null {
  const digits = value?.replace(/\D/g, "");
  if (!digits || digits.length < 12) return null;
  const [year, month, day, hour, minute] = [
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)),
    Number(digits.slice(6, 8)),
    Number(digits.slice(8, 10)),
    Number(digits.slice(10, 12)),
  ];
  // KST 는 DST 가 없어 고정 +9 로 안전하게 역산할 수 있다.
  const utc = Date.UTC(year, month - 1, day, hour - 9, minute);
  return Number.isNaN(utc) ? null : new Date(utc).toISOString();
}

export function normalizeKacItem(
  item: KacItem,
  flightNumberKey: string,
  departureAirport: string,
): FlightSearchResult | null {
  const scheduledAt = kacTimeToUtc(item.scheduleDateTime);
  const arrivalAirport = item.airportCode?.trim().toUpperCase();
  if (!scheduledAt || !arrivalAirport || arrivalAirport.length !== 3) return null;

  const arrivalTimezone = airportTimezone(arrivalAirport);
  // 도착 공항의 시간대를 모르면 저장하지 않는다. 틀린 시간대로 넣으면 그
  // 여행의 모든 시각 표시가 조용히 어긋난다.
  if (!arrivalTimezone) return null;

  return {
    provider: "kac_gw",
    providerFlightId: item.flightId ?? null,
    marketingFlightNumber: item.flightId?.replace(/\s+/g, "").toUpperCase() ?? flightNumberKey,
    operatingFlightNumber: null,
    airlineCode: null,
    operatingAirlineCode: null,
    airlineName: item.airline?.trim() || null,
    departure: {
      airport: departureAirport,
      terminal: item.terminalId?.trim() || null,
      gate: item.gatenumber?.trim() || null,
      timezone: "Asia/Seoul",
      scheduledAt,
      estimatedAt: kacTimeToUtc(item.estimatedDateTime),
      actualAt: null,
    },
    /*
     * 이 API 는 출발편 목록이라 도착 예정시각을 주지 않는다.
     * 모르는 값을 지어내지 않고 출발 시각을 그대로 둔다 — 사용자가 수정 폼에서
     * 실제 도착 시각을 채우게 한다.
     */
    arrival: {
      airport: arrivalAirport,
      terminal: null,
      gate: null,
      timezone: arrivalTimezone,
      scheduledAt,
      estimatedAt: null,
      actualAt: null,
    },
    status: toStatus(item.remark),
    raw: item as Record<string, unknown>,
  };
}

export const kacGwProvider: FlightProvider = {
  id: "kac_gw",
  label: "한국공항공사",

  isConfigured() {
    return Boolean(process.env.KAC_GW_API_KEY);
  },

  async search({ flightNumberKey, departureDate }: FlightSearchInput) {
    const key = process.env.KAC_GW_API_KEY;
    if (!key) throw new FlightSearchError("KAC_GW_API_KEY 가 없습니다.", "not_configured");

    const url = new URL(ENDPOINT);
    url.searchParams.set("serviceKey", key);
    url.searchParams.set("type", "json");
    url.searchParams.set("numOfRows", "50");
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("flight_id", flightNumberKey);
    url.searchParams.set("searchday", departureDate.replace(/-/g, ""));

    let response: Response;
    try {
      response = await fetch(url, {
        next: { revalidate: 60 * 10 },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new FlightSearchError(
        `항공편 조회 서버에 연결하지 못했습니다: ${(error as Error).message}`,
        "network",
      );
    }

    if (!response.ok) {
      throw new FlightSearchError(`항공편 조회에 실패했습니다 (${response.status})`, "upstream");
    }

    const body = (await response.json()) as {
      response?: { body?: { items?: KacItem[] | { item?: KacItem[] } } };
    };
    const items = body.response?.body?.items;
    const list = Array.isArray(items) ? items : (items?.item ?? []);

    return list
      // 국내 출발편 목록이라 출발지는 인천으로 고정할 수 없다. 응답의 공항
      // 코드가 도착지이므로 출발지는 조회 대상 공항(ICN)으로 둔다.
      .map((item) => normalizeKacItem(item, flightNumberKey, "ICN"))
      .filter((result): result is FlightSearchResult => result !== null);
  },
};
