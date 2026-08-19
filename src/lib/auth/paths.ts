/**
 * 인증 없이 접근할 수 있는 경로.
 *
 * 화이트리스트로 관리한다. 블랙리스트("이 경로만 보호")로 만들면 새 페이지를
 * 추가할 때마다 보호를 잊어버려 조용히 열린다.
 */
const PUBLIC_PREFIXES = [
  "/login",
  // 로그인 콜백, 로그아웃, 오류 페이지
  "/auth",
  // 공유 토큰 검증 (쿠키 발급 후 /s 로 리다이렉트)
  "/share",
  // 토큰 없는 읽기 전용 공유 뷰
  "/s",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function requiresAuth(pathname: string): boolean {
  return !isPublicPath(pathname);
}
