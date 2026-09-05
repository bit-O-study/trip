import { expect, test } from "@playwright/test";

const email = process.env.E2E_ACCOUNT_EMAIL;
const password = process.env.E2E_ACCOUNT_PASSWORD;

test("초대 공유는 다른 앱 연결 없이 Trip 웹 주소를 전달한다", async ({ page }) => {
  test.skip(!email || !password, "실계정 검증용 환경변수가 필요합니다.");
  await page.goto("/login");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.locator('form button[type="submit"]').click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/trips/new");
  const title = `초대검증-${Date.now()}`;
  await page.locator("#title").fill(title);
  await page.locator("#startDate").fill("2026-09-10");
  await page.locator("#endDate").fill("2026-09-11");
  await page.getByRole("button", { name: "여행 만들기" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15000 });
  await page.getByText("여행 관리", { exact: true }).click();
  await page.getByRole("button", { name: "참여 초대 링크 만들기" }).click();
  const input = page.getByRole("textbox", { name: "참여 초대 링크" });
  await expect(input).toBeVisible({ timeout: 15000 });
  const inviteUrl = await input.inputValue();
  expect(new URL(inviteUrl).origin).toBe(new URL(page.url()).origin);
  expect(new URL(inviteUrl).pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);

  // 실제 메신저로 보내지 않고 운영체제 공유 창에 전달하는 데이터만 검사한다.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        document.documentElement.dataset.inviteShare = JSON.stringify(data);
      },
    });
  });
  await page.getByRole("button", { name: "카카오톡 등으로 초대" }).click();
  const payload = await page.evaluate(() => JSON.parse(document.documentElement.dataset.inviteShare!));
  expect(payload.url).toBe(inviteUrl);
  expect(payload.title).toContain("Trip Planner");
  await expect(page.locator('script[data-kakao-sdk="share"]')).toHaveCount(0);
  await page.getByRole("button", { name: "여행 삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
});
