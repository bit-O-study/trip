/**
 * 로그인 후 돌아갈 경로를 안전하게 정규화한다.
 *
 * `?next=` 값을 그대로 믿고 리다이렉트하면 오픈 리다이렉트가 된다. 공격자가
 * `/login?next=https://evil.example` 링크를 뿌리면, 사용자는 우리 도메인에서
 * 로그인한 뒤 공격자 사이트로 넘어간다. 피싱에 그대로 쓰인다.
 *
 * 규칙: 같은 출처의 절대 경로만 허용한다.
 */
export const DEFAULT_REDIRECT = "/";

/**
 * 제어문자 검출.
 *
 * 정규식 리터럴 대신 문자열로 만든다. 소스에 실제 제어문자가 들어가면
 * 파일이 바이너리로 취급되어 diff·리뷰가 불가능해진다.
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

export function safeRedirectPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_REDIRECT,
): string {
  if (!raw) return fallback;

  // "/" 로 시작하지 않으면 상대 경로거나 절대 URL이다. 둘 다 거부한다.
  if (!raw.startsWith("/")) return fallback;

  // "//evil.example" 은 프로토콜 상대 URL 이라 외부로 나간다.
  if (raw.startsWith("//")) return fallback;

  // 백슬래시는 일부 브라우저가 "/" 로 정규화해 "/\evil.example" 이 외부로 나간다.
  if (raw.includes("\\")) return fallback;

  // 탭·개행 같은 제어문자를 끼워 넣어 위 검사를 우회하는 경우를 막는다.
  if (CONTROL_CHARS.test(raw)) return fallback;

  return raw;
}

/**
 * 보호된 경로에서 로그인 페이지로 보낼 때 쓰는 URL.
 * 로그인 후 원래 가려던 곳으로 돌아오게 한다.
 */
export function buildLoginUrl(pathnameWithSearch: string): string {
  const next = safeRedirectPath(pathnameWithSearch);
  if (next === DEFAULT_REDIRECT) return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}
