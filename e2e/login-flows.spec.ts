import { expect, test, type Page } from "@playwright/test";

/*
 * 로그인이 필요한 핵심 흐름.
 *
 * docs/pre-deploy-checklist.md 2절의 시나리오를 화면에서 그대로 재현한다.
 * RLS·정렬 같은 규칙은 단위/DB 테스트가 이미 덮는다. 여기서 확인하는 것은
 * "실제 브라우저에서 서버 액션이 끝까지 도는가" 하나다.
 *
 * 계정 정보는 파일에 두지 않고 실행 환경으로만 받는다.
 */
const accountEmail = process.env.E2E_ACCOUNT_EMAIL;
const accountPassword = process.env.E2E_ACCOUNT_PASSWORD;

/** 테스트마다 자기 여행을 만든다. 이름이 겹치면 병렬 실행에서 서로를 지운다. */
function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#email").fill(accountEmail!);
  await page.locator("#password").fill(accountPassword!);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

/** 여행을 만들고 상세 페이지에 머문 채 제목을 돌려준다. */
async function createTrip(page: Page, title: string) {
  await page.goto("/trips/new");
  await page.locator("#title").fill(title);
  await page.locator("#startDate").fill("2026-09-10");
  await page.locator("#endDate").fill("2026-09-11");
  await page.getByRole("button", { name: "여행 만들기" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.describe("로그인 후 핵심 흐름", () => {
  test.skip(
    !accountEmail || !accountPassword,
    "E2E_ACCOUNT_EMAIL/E2E_ACCOUNT_PASSWORD 가 있어야 실행합니다.",
  );

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("일정을 추가하면 타임라인에 보이고, 삭제하면 사라진다", async ({ page }) => {
    await createTrip(page, unique("일정삭제"));

    const itemTitle = unique("점심");
    await page.getByRole("button", { name: "+ 일정 추가" }).first().click();
    await page.locator("#item-title").fill(itemTitle);
    await page.getByRole("button", { name: "추가", exact: true }).click();

    // 제목은 아이콘·시각과 한 줄에 들어가므로 행 단위로 찾는다.
    const item = page.getByRole("listitem").filter({ hasText: itemTitle });
    await expect(item).toBeVisible();

    await page.getByRole("button", { name: `${itemTitle} 삭제` }).click();
    await expect(item).toHaveCount(0);
    // 새로고침해도 살아 돌아오지 않아야 진짜 삭제다.
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: itemTitle })).toHaveCount(0);
  });

  test("투표를 만들면 장소 검색으로 안내하고, 만든 사람은 삭제할 수 있다", async ({ page }) => {
    await createTrip(page, unique("투표삭제"));

    const pollTitle = unique("점심투표");
    await page.getByText("새 투표 만들기").click();
    const pollForm = page.locator('form:has(input[name="scheduledLocal"])');
    await pollForm.locator('input[name="title"]').fill(pollTitle);
    await pollForm.getByRole("button", { name: "투표 만들기" }).click();

    // 투표를 만든 뒤 후보를 등록할 곳으로 데려가야 한다.
    await expect(page).toHaveURL(/[?&]poll=[0-9a-f-]{36}/);
    await expect(page.getByText("투표가 만들어졌습니다. 장소를 검색해 후보로 등록하세요.")).toBeVisible();
    await expect(page.getByRole("heading", { name: pollTitle })).toBeVisible();

    await page.getByRole("button", { name: `${pollTitle} 삭제` }).click();
    await expect(page.getByRole("heading", { name: pollTitle })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: pollTitle })).toHaveCount(0);
  });

  test("여행 상세의 지도가 오류 안내 없이 표시된다", async ({ page }) => {
    await createTrip(page, unique("지도"));

    await expect(page.locator('[role="application"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("지도를 표시할 수 없습니다")).toHaveCount(0);
  });

  test("여행을 삭제하면 목록에서 사라지고 휴지통에서 복구된다", async ({ page }) => {
    const title = unique("여행삭제");
    await createTrip(page, title);

    await page.getByText("여행 관리").click();
    await page.getByRole("button", { name: "여행 삭제" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

    // 같은 계정으로 mobile·desktop 이 동시에 돌므로 휴지통에는 남의 여행도 있다.
    // 첫 번째 복구 버튼을 누르면 서로의 여행을 되살린다. 반드시 행을 좁힌다.
    await page.goto("/trips/trash");
    const trashRow = page.getByRole("listitem").filter({ hasText: title });
    await expect(trashRow).toBeVisible();
    await trashRow.getByRole("button", { name: "복구" }).click();
    // 복구가 끝나기 전에 페이지를 옮기면 서버 액션 요청이 중단된다.
    await expect(trashRow).toHaveCount(0);

    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  });
});
