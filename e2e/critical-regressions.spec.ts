import { expect, test } from "@playwright/test";

const accountEmail = process.env.E2E_ACCOUNT_EMAIL;
const accountPassword = process.env.E2E_ACCOUNT_PASSWORD;
const hasAccount = Boolean(accountEmail && accountPassword);

test.describe("배포 전 핵심 회귀", () => {
  test.skip(!hasAccount, "E2E_ACCOUNT_EMAIL/PASSWORD가 있어야 실제 계정 검증을 실행합니다.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(accountEmail!);
    await page.locator('input[name="password"]').fill(accountPassword!);
    await page.locator('form button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  });

  test("기존 여행 상세에서 Google 지도가 실제로 표시된다", async ({ page }) => {
    const firstTrip = page.locator('main a[href^="/trips/"]:not([href="/trips/new"]):not([href="/trips/trash"])').first();
    test.skip((await firstTrip.count()) === 0, "계정에 지도 확인용 여행이 없습니다.");
    await firstTrip.click();

    await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("지도를 표시할 수 없습니다")).toHaveCount(0);

    const timelinePointIds = await page.locator("[data-select-item]").evaluateAll((elements) =>
      elements.map((element) => element.closest("li")?.id.replace(/^item-/, "")).filter(Boolean).sort(),
    );
    await expect.poll(() => page.locator("[data-point-id]").count()).toBe(timelinePointIds.length);
    const markerPointIds = await page.locator("[data-point-id]").evaluateAll((elements) =>
      elements.map((element) => (element as HTMLElement).dataset.pointId).filter(Boolean).sort(),
    );
    expect(markerPointIds).toEqual(timelinePointIds);
  });
});
