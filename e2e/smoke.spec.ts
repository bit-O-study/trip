import { expect, test } from "@playwright/test";

/*
 * 3단계부터 "/" 를 포함한 대부분의 경로가 보호된다.
 * 로그인이 필요한 화면의 E2E 는 Supabase 프로젝트가 생긴 뒤 4단계에서 추가한다.
 * 여기서는 로그아웃 상태에서 실제로 관찰할 수 있는 것만 검증한다.
 */

test.describe("앱 셸 (로그아웃 상태)", () => {
  test("로그인 페이지가 렌더링된다", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "로그인", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Trip Planner" })).toBeVisible();
  });

  test("내비게이션 대신 로그인 버튼이 보인다", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(0);
    await expect(page.getByTestId("main-nav-tab")).toHaveCount(0);
    await expect(page.locator("header").getByRole("link", { name: "로그인" })).toBeVisible();
  });

  test("본문 건너뛰기 링크가 키보드 포커스로 노출된다", async ({ page }) => {
    await page.goto("/login");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
  });

  test("가로 스크롤이 발생하지 않는다", async ({ page }) => {
    await page.goto("/login");

    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows).toBe(false);
  });
});

test.describe("반응형 내비게이션", () => {
  /*
   * 하단 탭바 / 상단 인라인 링크 전환은 로그인 상태에서만 렌더링된다.
   * Supabase 프로젝트와 테스트 계정이 준비되면 4단계에서 되살린다.
   * 활성 표시 로직 자체는 src/components/layout/main-nav.test.tsx 가 검증한다.
   */
  test.skip("모바일에서는 하단 탭바만 노출된다 (로그인 필요, 4단계)", () => {});
  test.skip("데스크톱에서는 상단 인라인 링크만 노출된다 (로그인 필요, 4단계)", () => {});
  test.skip("하단 탭바가 본문 마지막 내용을 가리지 않는다 (로그인 필요, 4단계)", () => {});
});
