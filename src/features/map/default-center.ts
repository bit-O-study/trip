/**
 * 일정이 아직 없는 여행의 지도 시작 위치.
 *
 * 좌표가 없으면 지도는 서울로 열렸다. 대만 여행인데 서울 지도가 뜨면 "장소를 찾아 추가하세요" 가
 * 엉뚱한 곳을 가리키므로, 여행의 시간대로 대표 도시를 골라 그 근처에서 시작한다.
 * 표에 없는 시간대는 null — 틀린 곳을 보여 주느니 지도 기본값(서울)에 맡긴다.
 */
const CENTERS: Readonly<Record<string, { latitude: number; longitude: number }>> = {
  "Asia/Taipei": { latitude: 25.0478, longitude: 121.5319 },
  "Asia/Tokyo": { latitude: 35.6812, longitude: 139.7671 },
  "Asia/Hong_Kong": { latitude: 22.2819, longitude: 114.1581 },
  "Asia/Macau": { latitude: 22.1987, longitude: 113.5439 },
  "Asia/Shanghai": { latitude: 31.2304, longitude: 121.4737 },
  "Asia/Singapore": { latitude: 1.2903, longitude: 103.8519 },
  "Asia/Bangkok": { latitude: 13.7563, longitude: 100.5018 },
  "Asia/Ho_Chi_Minh": { latitude: 16.0544, longitude: 108.2022 },
  "Asia/Manila": { latitude: 14.5995, longitude: 120.9842 },
  "Asia/Kuala_Lumpur": { latitude: 3.139, longitude: 101.6869 },
  "Asia/Jakarta": { latitude: -6.2088, longitude: 106.8456 },
  "Asia/Makassar": { latitude: -8.65, longitude: 115.2167 },
  "Asia/Dubai": { latitude: 25.2048, longitude: 55.2708 },
  "Asia/Ulaanbaatar": { latitude: 47.8864, longitude: 106.9057 },
  "Europe/London": { latitude: 51.5074, longitude: -0.1278 },
  "Europe/Paris": { latitude: 48.8566, longitude: 2.3522 },
  "Europe/Rome": { latitude: 41.9028, longitude: 12.4964 },
  "Europe/Madrid": { latitude: 40.4168, longitude: -3.7038 },
  "Europe/Berlin": { latitude: 52.52, longitude: 13.405 },
  "Europe/Prague": { latitude: 50.0755, longitude: 14.4378 },
  "Europe/Istanbul": { latitude: 41.0082, longitude: 28.9784 },
  "America/New_York": { latitude: 40.7128, longitude: -74.006 },
  "America/Chicago": { latitude: 41.8781, longitude: -87.6298 },
  "America/Los_Angeles": { latitude: 34.0522, longitude: -118.2437 },
  "America/Vancouver": { latitude: 49.2827, longitude: -123.1207 },
  "Pacific/Honolulu": { latitude: 21.3069, longitude: -157.8583 },
  "Pacific/Guam": { latitude: 13.4443, longitude: 144.7937 },
  "Australia/Sydney": { latitude: -33.8688, longitude: 151.2093 },
  "Australia/Melbourne": { latitude: -37.8136, longitude: 144.9631 },
};

export function defaultCenterForTimezone(
  timezone: string | null | undefined,
): { latitude: number; longitude: number } | null {
  return timezone ? (CENTERS[timezone] ?? null) : null;
}
