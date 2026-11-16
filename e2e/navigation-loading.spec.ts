import { expect, test } from "@playwright/test";

test("느린 화면 이동은 대기 안내를 보여주고 완료 후 사라진다", async ({ page }) => {
  const release: Array<() => void> = [];
  let waiting = true;
  await page.route("**/legal/privacy*", async route => {
    if (route.request().headers().rsc === "1" && waiting) {
      await new Promise<void>(resolve => release.push(resolve));
    }
    await route.continue();
  });
  try {
    await page.goto("/login");
    await page.getByRole("navigation", { name: "약관" }).getByRole("link", { name: "개인정보처리방침" }).click();
    await expect(page.getByRole("status").filter({ hasText: "화면 불러오는 중…" })).toBeVisible();
    waiting = false;
    release.forEach(resolve => resolve());
    await expect(page.locator("h1")).toHaveText("개인정보처리방침");
    await expect(page.getByText("화면 불러오는 중…", { exact: true })).toHaveCount(0);
  } finally {
    waiting = false;
    release.forEach(resolve => resolve());
  }
});
