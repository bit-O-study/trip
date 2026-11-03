/**
 * 도시 이름으로 시간대·통화를 제안한다.
 *
 * 새 여행의 기본이 Asia/Seoul·KRW 라서 해외 여행을 만들고도 그대로 두면 모든 일정이
 * 서울 시각으로 표시된다. 자주 가는 곳만 가볍게 짚어 주고, 사용자가 직접 고르면 따르지 않는다.
 * 목록에 없는 곳은 제안하지 않는다(틀린 제안보다 제안 없음이 낫다).
 */
type Hint = { keywords: string[]; timezone: string; currency: string; label: string };

const HINTS: Hint[] = [
  { keywords: ["서울", "부산", "제주", "인천", "강릉", "경주", "여수", "전주"], timezone: "Asia/Seoul", currency: "KRW", label: "한국" },
  { keywords: ["도쿄", "오사카", "교토", "후쿠오카", "삿포로", "나고야", "오키나와", "일본"], timezone: "Asia/Tokyo", currency: "JPY", label: "일본" },
  { keywords: ["타이베이", "타이중", "가오슝", "타이난", "화롄", "대만"], timezone: "Asia/Taipei", currency: "TWD", label: "대만" },
  { keywords: ["홍콩"], timezone: "Asia/Hong_Kong", currency: "HKD", label: "홍콩" },
  { keywords: ["상하이", "베이징", "중국"], timezone: "Asia/Shanghai", currency: "CNY", label: "중국" },
  { keywords: ["싱가포르"], timezone: "Asia/Singapore", currency: "SGD", label: "싱가포르" },
  { keywords: ["방콕", "치앙마이", "푸켓", "태국"], timezone: "Asia/Bangkok", currency: "THB", label: "태국" },
  { keywords: ["하노이", "다낭", "호치민", "나트랑", "베트남"], timezone: "Asia/Ho_Chi_Minh", currency: "VND", label: "베트남" },
  { keywords: ["마닐라", "세부", "보라카이", "필리핀"], timezone: "Asia/Manila", currency: "PHP", label: "필리핀" },
  { keywords: ["두바이"], timezone: "Asia/Dubai", currency: "AED", label: "두바이" },
  { keywords: ["런던", "영국"], timezone: "Europe/London", currency: "GBP", label: "영국" },
  { keywords: ["파리", "프랑스"], timezone: "Europe/Paris", currency: "EUR", label: "프랑스" },
  { keywords: ["로마", "밀라노", "이탈리아"], timezone: "Europe/Rome", currency: "EUR", label: "이탈리아" },
  { keywords: ["뉴욕", "보스턴", "워싱턴"], timezone: "America/New_York", currency: "USD", label: "미국 동부" },
  { keywords: ["로스앤젤레스", "샌프란시스코", "라스베이거스", "시애틀"], timezone: "America/Los_Angeles", currency: "USD", label: "미국 서부" },
  { keywords: ["시드니", "멜버른", "호주"], timezone: "Australia/Sydney", currency: "AUD", label: "호주" },
  { keywords: ["괌"], timezone: "Pacific/Guam", currency: "USD", label: "괌" },
];

export type DestinationHint = { timezone: string; currency: string; label: string };

export function hintForDestination(destination: string): DestinationHint | null {
  const text = destination.trim();
  if (!text) return null;
  const found = HINTS.find((hint) => hint.keywords.some((keyword) => text.includes(keyword)));
  return found ? { timezone: found.timezone, currency: found.currency, label: found.label } : null;
}
