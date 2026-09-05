import { airportTimezone } from "@/features/flights/airports";
import {
  FlightSearchError,
  type FlightEndpoint,
  type FlightProvider,
  type FlightSearchInput,
  type FlightSearchResult,
  type FlightStatus,
} from "@/features/flights/provider";

/**
 * AeroDataBox 어댑터 (ADR-0001 후보 B).
 *
 * 미래 스케줄 조회가 되는 것이 이 공급자를 두는 이유다. 여행 계획은 보통 수 주~
 * 수 개월 전에 세우는데, 실시간 운항정보만 주는 공급자로는 MVP 기준 3번을
 * 채울 수 없다 (ADR-0001 검증 항목 4).
 *
 * ⚠ **실제 응답으로 검증하지 못했다.** 발급된 키가 없어 아래 매핑은 공개
 * 문서의 스키마를 따랐을 뿐이다. 키를 넣고 첫 조회를 한 뒤 ADR 의 12개 항목을
 * 채우고 필요하면 이 매핑을 고쳐야 한다. 알 수 없는 필드는 만들어 내지 않고
 * null 로 두었다 — 틀린 값보다 빈 값이 낫다.
 */

const HOST = "aerodatabox.p.rapidapi.com";

type AeroTime = { utc?: string; local?: string };
type AeroPoint = {
  airport?: { iata?: string; icao?: string; timeZone?: string; name?: string };
  terminal?: string;
  gate?: string;
  scheduledTime?: AeroTime;
  revisedTime?: AeroTime;
  runwayTime?: AeroTime;
};
type AeroFlight = {
  number?: string;
  callSign?: string;
  status?: string;
  codeshareStatus?: string;
  airline?: { name?: string; iata?: string };
  departure?: AeroPoint;
  arrival?: AeroPoint;
};

/**
 * AeroDataBox 의 시각은 "2026-02-14 08:20+09:00" 처럼 공백을 쓴다.
 * `Date.parse` 는 이 형태를 환경에 따라 다르게 읽으므로 T 를 넣어 정규화한다.
 */
function toUtcIso(time: AeroTime | undefined): string | null {
  const raw = time?.utc ?? time?.local;
  if (!raw) return null;
  const parsed = new Date(raw.trim().replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

const STATUS: Record<string, FlightStatus> = {
  Expected: "scheduled",
  EnRoute: "departed",
  CheckIn: "scheduled",
  Boarding: "boarding",
  GateClosed: "boarding",
  Departed: "departed",
  Delayed: "delayed",
  Approaching: "departed",
  Arrived: "landed",
  Canceled: "cancelled",
  Cancelled: "cancelled",
  Diverted: "diverted",
  CanceledUncertain: "cancelled",
};

function endpoint(point: AeroPoint | undefined): FlightEndpoint | null {
  const airport = point?.airport?.iata?.trim().toUpperCase();
  const scheduledAt = toUtcIso(point?.scheduledTime);
  if (!airport || airport.length !== 3 || !scheduledAt) return null;

  // 공급자가 준 시간대를 우선한다. 우리 표는 공급자가 침묵할 때만 쓴다.
  const timezone = point?.airport?.timeZone?.trim() || airportTimezone(airport);
  if (!timezone) return null;

  return {
    airport,
    terminal: point?.terminal?.trim() || null,
    gate: point?.gate?.trim() || null,
    timezone,
    scheduledAt,
    estimatedAt: toUtcIso(point?.revisedTime),
    actualAt: toUtcIso(point?.runwayTime),
  };
}

export function normalizeAeroFlight(
  flight: AeroFlight,
  requestedNumber: string,
): FlightSearchResult | null {
  const departure = endpoint(flight.departure);
  const arrival = endpoint(flight.arrival);
  // 출발·도착 중 하나라도 못 읽으면 일정으로 쓸 수 없다. 반쪽 항공편을 만들지 않는다.
  if (!departure || !arrival) return null;

  const marketing = flight.number?.replace(/\s+/g, "").toUpperCase() || requestedNumber;
  const operating = flight.callSign?.replace(/\s+/g, "").toUpperCase() || null;

  return {
    provider: "aerodatabox",
    providerFlightId: flight.number ?? null,
    marketingFlightNumber: marketing,
    // 코드셰어가 아니면 운항 편명을 따로 두지 않는다. 같은 값을 두 곳에 넣으면
    // 중복 감지가 항상 참이 된다.
    operatingFlightNumber: operating && operating !== marketing ? operating : null,
    airlineCode: flight.airline?.iata?.toUpperCase() ?? null,
    operatingAirlineCode: null,
    airlineName: flight.airline?.name ?? null,
    departure,
    arrival,
    status: STATUS[flight.status ?? ""] ?? "unknown",
    raw: flight as Record<string, unknown>,
  };
}

export const aeroDataBoxProvider: FlightProvider = {
  id: "aerodatabox",
  label: "AeroDataBox",

  isConfigured() {
    return Boolean(process.env.AERODATABOX_API_KEY);
  },

  async search({ flightNumberKey, departureDate }: FlightSearchInput) {
    const key = process.env.AERODATABOX_API_KEY;
    if (!key) {
      throw new FlightSearchError("AERODATABOX_API_KEY 가 없습니다.", "not_configured");
    }

    const url = `https://${HOST}/flights/number/${encodeURIComponent(flightNumberKey)}/${departureDate}`;

    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
        // 미래 스케줄은 자주 바뀌지 않는다. 쿼터를 아끼려고 캐시한다.
        next: { revalidate: 60 * 30 },
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw new FlightSearchError(
        `항공편 조회 서버에 연결하지 못했습니다: ${(error as Error).message}`,
        "network",
      );
    }

    // 없는 편명은 오류가 아니라 "못 찾음" 이다. 다음 공급자로 넘어간다.
    if (response.status === 404) return [];
    if (response.status === 429) {
      throw new FlightSearchError("항공편 조회 한도를 초과했습니다.", "quota");
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new FlightSearchError(
        `항공편 조회에 실패했습니다 (${response.status}): ${detail.slice(0, 160)}`,
        "upstream",
      );
    }

    const body = (await response.json()) as AeroFlight[] | { flights?: AeroFlight[] };
    const flights = Array.isArray(body) ? body : (body.flights ?? []);
    return flights
      .map((flight) => normalizeAeroFlight(flight, flightNumberKey))
      .filter((result): result is FlightSearchResult => result !== null);
  },
};
