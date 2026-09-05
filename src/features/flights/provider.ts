/**
 * 항공 공급자 어댑터의 공통 경계.
 *
 * 공급자는 아직 확정되지 않았다 (→ docs/adr/0001-flight-data-provider.md).
 * 그래서 화면과 저장 경로는 이 타입에만 의존하고, 공급자별 구현은 뒤에 숨긴다.
 * 공급자가 바뀌어도 고칠 곳이 어댑터 하나로 끝나야 한다.
 *
 * **자동 검색은 편의지 필수 경로가 아니다.** 공급자가 하나도 설정되지 않았거나
 * 전부 실패해도 수동 입력으로 일정을 만들 수 있어야 한다 (architecture.md §1).
 */

export type FlightEndpoint = {
  /** IATA 3자 공항 코드 */
  airport: string;
  terminal: string | null;
  gate: string | null;
  /** 공항 현지 시간대(IANA). 행에 저장해 나중에 흔들리지 않게 한다. */
  timezone: string;
  /** UTC ISO */
  scheduledAt: string;
  estimatedAt: string | null;
  actualAt: string | null;
};

export type FlightStatus =
  | "scheduled"
  | "delayed"
  | "boarding"
  | "departed"
  | "landed"
  | "cancelled"
  | "diverted"
  | "unknown";

export type FlightSearchResult = {
  provider: "kac_gw" | "aerodatabox" | "manual";
  providerFlightId: string | null;
  /** 티켓에 적힌 판매 편명 */
  marketingFlightNumber: string;
  /** 코드셰어의 실제 운항 편명. 같은 항공편이 두 편명으로 중복 등록되는 것을 막는다. */
  operatingFlightNumber: string | null;
  airlineCode: string | null;
  operatingAirlineCode: string | null;
  airlineName: string | null;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  status: FlightStatus;
  /** 공급자 원문. 나중에 필드를 더 뽑아 쓸 수 있게 통째로 둔다. */
  raw: Record<string, unknown>;
};

export class FlightSearchError extends Error {
  constructor(
    message: string,
    readonly kind: "not_configured" | "not_found" | "quota" | "upstream" | "network",
  ) {
    super(message);
    this.name = "FlightSearchError";
  }
}

/**
 * 편명 정규화.
 *
 * 사용자는 "KE 0703", "ke703", "KE-703" 을 모두 같은 편으로 여긴다. 공급자
 * 조회에는 정규화한 값을 쓰고, 표시에는 입력 원문을 그대로 남긴다
 * (architecture.md §4).
 *
 *   "KE 0703"  ->  { input: "KE 0703", key: "KE703" }
 *
 * 선행 0 을 지우는 것이 핵심이다. 지우지 않으면 같은 항공편이 "KE0703" 과
 * "KE703" 두 행으로 갈라진다.
 */
export function normalizeFlightNumber(input: string): { input: string; key: string } | null {
  const trimmed = input.trim();
  const compact = trimmed.replace(/[\s-]/g, "").toUpperCase();
  /*
   * 항공사 코드를 `[A-Z0-9]{2,3}` 로 두면 안 된다. 그러면 "KE703" 에서
   * 코드가 "KE7" 까지 먹어 편번호가 "3" 이 된다. 실제로 그렇게 깨졌다.
   *
   * 코드의 형태를 명시한다 — ICAO 3자(KAL), IATA 2자(KE / 7C / 9W).
   * 그 뒤가 선행 0 을 뺀 1~4자리 편번호, 마지막 알파벳은 분리편 접미사다.
   */
  const match = compact.match(/^([A-Z]{3}|[A-Z][0-9]|[0-9][A-Z]|[A-Z]{2})0*(\d{1,4})([A-Z]?)$/);
  if (!match) return null;
  return { input: trimmed, key: `${match[1]}${match[2]}${match[3]}` };
}

export type FlightSearchInput = {
  /** 정규화된 편명 ("KE703") */
  flightNumberKey: string;
  /** 출발일 (YYYY-MM-DD, 출발 공항 현지 기준) */
  departureDate: string;
};

export type FlightProvider = {
  id: "kac_gw" | "aerodatabox";
  label: string;
  /** 키가 없으면 false. 설정되지 않은 공급자는 조회 대상에서 빠진다. */
  isConfigured(): boolean;
  search(input: FlightSearchInput): Promise<FlightSearchResult[]>;
};

/**
 * 여러 공급자를 순서대로 시도한다.
 *
 * 하나가 실패해도 다음으로 넘어간다 — 국내선은 한국공항공사가, 해외 노선은
 * AeroDataBox 가 답하는 식이라 "첫 공급자가 못 찾음" 은 흔한 정상 상황이다.
 * 전부 실패했을 때만 오류를 올리고, 화면은 그때도 수동 입력을 계속 보여 준다.
 */
export async function searchFlights(
  providers: readonly FlightProvider[],
  input: FlightSearchInput,
): Promise<{ results: FlightSearchResult[]; tried: string[] }> {
  const configured = providers.filter((provider) => provider.isConfigured());
  if (configured.length === 0) {
    throw new FlightSearchError(
      "항공편 조회 공급자가 설정되지 않았습니다. 아래에서 직접 입력할 수 있습니다.",
      "not_configured",
    );
  }

  const tried: string[] = [];
  let lastError: FlightSearchError | null = null;

  for (const provider of configured) {
    tried.push(provider.id);
    try {
      const results = await provider.search(input);
      if (results.length > 0) return { results, tried };
    } catch (error) {
      lastError =
        error instanceof FlightSearchError
          ? error
          : new FlightSearchError(
              `${provider.label} 조회에 실패했습니다: ${(error as Error).message}`,
              "upstream",
            );
    }
  }

  if (lastError) throw lastError;
  return { results: [], tried };
}
