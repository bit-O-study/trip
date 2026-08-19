import { expect, test } from "@playwright/test";

test.describe("앱 셸", () => {
  test("여행 목록 진입 시 빈 상태와 CTA가 보인다", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "내 여행", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "아직 만든 여행이 없습니다" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "첫 여행 만들기" })).toBeVisible();
  });

  test("새 여행으로 이동한다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "첫 여행 만들기" }).click();

    await expect(page).toHaveURL(/\/trips\/new$/);
    await expect(
      page.getByRole("heading", { name: "새 여행", level: 1 }),
    ).toBeVisible();
  });

  test("본문 건너뛰기 링크가 키보드 포커스로 노출된다", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("link", { name: "본문으로 건너뛰기" })).toBeFocused();
  });

  test("가로 스크롤이 발생하지 않는다", async ({ page }) => {
    await page.goto("/");

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
   * display:none 인 내비게이션은 접근성 트리에서 완전히 제거되므로
   * getByRole("navigation") 은 어느 뷰포트에서든 항상 1개만 잡힌다.
   * 이것이 의도한 동작이다 — 숨긴 메뉴가 스크린리더에 읽히면 안 된다.
   * 두 변형의 구분은 data-testid 로 한다.
   */
  test("모바일에서는 하단 탭바만 노출된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(1);
    await expect(page.getByTestId("main-nav-tab")).toBeVisible();
    await expect(page.getByTestId("main-nav-bar")).toBeHidden();

    await expect(
      page.getByTestId("main-nav-tab").getByRole("link", { name: /내 여행/ }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("데스크톱에서는 상단 인라인 링크만 노출된다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toHaveCount(1);
    await expect(page.getByTestId("main-nav-bar")).toBeVisible();
    await expect(page.getByTestId("main-nav-tab")).toBeHidden();

    // 상단 바 안에 있어야 한다.
    await expect(
      page.locator("header").getByTestId("main-nav-bar"),
    ).toBeVisible();
  });

  test("하단 탭바가 본문 마지막 내용을 가리지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const cta = page.getByRole("link", { name: "첫 여행 만들기" });
    const nav = page.getByTestId("main-nav-tab");

    const ctaBox = await cta.boundingBox();
    const navBox = await nav.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(navBox).not.toBeNull();

    // CTA 하단이 탭바 상단보다 위에 있어야 겹치지 않는다.
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(navBox!.y);
  });
});
