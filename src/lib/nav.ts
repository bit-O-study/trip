export type NavItem = {
  href: string;
  label: string;
  /** 스크린리더에 읽히는 설명. 아이콘만 보이는 모바일 탭에서 필요하다. */
  description: string;
};

/**
 * 앱 최상위 내비게이션.
 *
 * 여행 내부의 일정/지도/설정 탭은 여행 상세 레이아웃이 별도로 가진다
 * (구현 순서 4단계). 여기에 섞으면 여행을 선택하지 않은 상태에서
 * 갈 곳 없는 탭이 생긴다.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "내 여행", description: "저장한 여행 목록" },
  { href: "/trips/new", label: "새 여행", description: "새 여행 만들기" },
] as const;

/**
 * 현재 경로가 해당 내비게이션 항목에 속하는지 판정한다.
 *
 * 루트("/")는 정확히 일치할 때만 활성이다. startsWith로 처리하면
 * 모든 경로가 루트에 매칭되어 탭 두 개가 동시에 활성으로 보인다.
 * 나머지는 하위 경로까지 활성으로 본다 (/trips/new/step-2 등).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
