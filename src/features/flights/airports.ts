/**
 * 공항 코드 → IANA 시간대.
 *
 * 항공편은 출발지와 도착지의 시간대가 다르고, 그 값은 **행에 저장해야 한다**
 * (architecture.md §4). 조회할 때마다 계산하면 공항 데이터가 바뀔 때 과거
 * 일정의 표시가 흔들린다.
 *
 * 이 표는 전 세계 공항을 담지 않는다 — 담을 수도 없고, 담으려 하면 갱신되지
 * 않는 죽은 데이터가 된다. 우선순위는 이렇다.
 *
 *   1. 공급자가 시간대를 주면 그것을 쓴다 (AeroDataBox 는 준다).
 *   2. 없으면 이 표를 본다. 한국·근거리 노선과 주요 장거리 목적지를 덮는다.
 *   3. 그래도 없으면 사용자가 직접 고르게 한다. 틀린 시간대로 조용히 저장하는
 *      것이 가장 나쁘다 — 그 여행의 모든 시각 표시가 어긋난다.
 */
export const AIRPORT_TIMEZONES: Readonly<Record<string, string>> = {
  // 대한민국
  ICN: "Asia/Seoul",
  GMP: "Asia/Seoul",
  CJU: "Asia/Seoul",
  PUS: "Asia/Seoul",
  TAE: "Asia/Seoul",
  CJJ: "Asia/Seoul",
  KWJ: "Asia/Seoul",
  RSU: "Asia/Seoul",
  USN: "Asia/Seoul",
  YNY: "Asia/Seoul",
  MWX: "Asia/Seoul",
  HIN: "Asia/Seoul",
  KUV: "Asia/Seoul",
  WJU: "Asia/Seoul",

  // 일본
  NRT: "Asia/Tokyo",
  HND: "Asia/Tokyo",
  KIX: "Asia/Tokyo",
  ITM: "Asia/Tokyo",
  NGO: "Asia/Tokyo",
  FUK: "Asia/Tokyo",
  CTS: "Asia/Tokyo",
  OKA: "Asia/Tokyo",
  KMJ: "Asia/Tokyo",
  KOJ: "Asia/Tokyo",
  HIJ: "Asia/Tokyo",
  TAK: "Asia/Tokyo",

  // 중화권
  PEK: "Asia/Shanghai",
  PKX: "Asia/Shanghai",
  PVG: "Asia/Shanghai",
  SHA: "Asia/Shanghai",
  CAN: "Asia/Shanghai",
  SZX: "Asia/Shanghai",
  TSN: "Asia/Shanghai",
  TAO: "Asia/Shanghai",
  DLC: "Asia/Shanghai",
  SYX: "Asia/Shanghai",
  HKG: "Asia/Hong_Kong",
  MFM: "Asia/Macau",
  TPE: "Asia/Taipei",
  TSA: "Asia/Taipei",
  KHH: "Asia/Taipei",

  // 동남아
  SIN: "Asia/Singapore",
  BKK: "Asia/Bangkok",
  DMK: "Asia/Bangkok",
  HKT: "Asia/Bangkok",
  CNX: "Asia/Bangkok",
  KUL: "Asia/Kuala_Lumpur",
  DPS: "Asia/Makassar",
  CGK: "Asia/Jakarta",
  MNL: "Asia/Manila",
  CEB: "Asia/Manila",
  SGN: "Asia/Ho_Chi_Minh",
  HAN: "Asia/Ho_Chi_Minh",
  DAD: "Asia/Ho_Chi_Minh",
  CXR: "Asia/Ho_Chi_Minh",
  PNH: "Asia/Phnom_Penh",
  VTE: "Asia/Vientiane",
  RGN: "Asia/Yangon",

  // 남아시아·중동
  DEL: "Asia/Kolkata",
  BOM: "Asia/Kolkata",
  DXB: "Asia/Dubai",
  AUH: "Asia/Dubai",
  DOH: "Asia/Qatar",
  IST: "Europe/Istanbul",

  // 오세아니아·태평양
  GUM: "Pacific/Guam",
  SPN: "Pacific/Saipan",
  SYD: "Australia/Sydney",
  MEL: "Australia/Melbourne",
  BNE: "Australia/Brisbane",
  AKL: "Pacific/Auckland",
  HNL: "Pacific/Honolulu",
  NAN: "Pacific/Fiji",

  // 유럽
  LHR: "Europe/London",
  LGW: "Europe/London",
  CDG: "Europe/Paris",
  ORY: "Europe/Paris",
  FRA: "Europe/Berlin",
  MUC: "Europe/Berlin",
  AMS: "Europe/Amsterdam",
  MAD: "Europe/Madrid",
  BCN: "Europe/Madrid",
  FCO: "Europe/Rome",
  MXP: "Europe/Rome",
  VIE: "Europe/Vienna",
  ZRH: "Europe/Zurich",
  PRG: "Europe/Prague",
  BUD: "Europe/Budapest",
  ARN: "Europe/Stockholm",
  CPH: "Europe/Copenhagen",
  HEL: "Europe/Helsinki",
  LIS: "Europe/Lisbon",
  SVO: "Europe/Moscow",

  // 북미
  JFK: "America/New_York",
  EWR: "America/New_York",
  BOS: "America/New_York",
  IAD: "America/New_York",
  ATL: "America/New_York",
  MIA: "America/New_York",
  YYZ: "America/Toronto",
  ORD: "America/Chicago",
  DFW: "America/Chicago",
  IAH: "America/Chicago",
  DEN: "America/Denver",
  LAX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  SAN: "America/Los_Angeles",
  LAS: "America/Los_Angeles",
  YVR: "America/Vancouver",

  // 중남미
  MEX: "America/Mexico_City",
  GRU: "America/Sao_Paulo",
  EZE: "America/Argentina/Buenos_Aires",
  LIM: "America/Lima",
};

/** 표에 있으면 IANA 이름, 없으면 null. 없을 때 임의로 채우지 않는다. */
export function airportTimezone(iata: string | null | undefined): string | null {
  if (!iata) return null;
  return AIRPORT_TIMEZONES[iata.trim().toUpperCase()] ?? null;
}

/** 값이 실제로 쓸 수 있는 IANA 시간대인지. 사용자가 직접 입력한 값 검증용. */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
