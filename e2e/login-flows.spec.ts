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

/** 직접 입력 폼으로 일정 하나를 만든다. 장소는 비워 둔다(선택 입력). */
async function addManualItem(page: Page, title: string, startLocal: string) {
  await page.reload();
  await page.getByRole("button", { name: "+ 일정 추가" }).first().click();
  await page.getByRole("button", { name: "직접 입력" }).click();
  await page.locator("#item-title").fill(title);
  await page.locator("#startLocal").fill(startLocal);
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
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
    /*
     * "+ 일정 추가" 는 장소 검색 모드로 열린다. 직접 입력 폼(`#item-title`)은
     * 토글을 눌러야 나온다 — 누르지 않으면 이 테스트는 존재하지 않는 입력을
     * 기다리다 끝난다.
     *
     * 장소를 비워 둔 채로 저장하는 것도 의도한 검증이다. 장소는 선택 입력이며,
     * Kakao 가 못 찾는다고 일정 추가가 막히면 안 된다.
     */
    await page.getByRole("button", { name: "직접 입력" }).click();
    await page.locator("#item-title").fill(itemTitle);
    await page.getByRole("button", { name: "추가", exact: true }).click();

    // 제목은 아이콘·시각과 한 줄에 들어가므로 행 단위로 찾는다.
    const item = page.getByRole("listitem").filter({ hasText: itemTitle });
    await expect(item).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: `${itemTitle} 삭제` }).click();
    await expect(item).toHaveCount(0);
    // 새로고침해도 살아 돌아오지 않아야 진짜 삭제다.
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: itemTitle })).toHaveCount(0);
  });

  /*
   * 재정렬은 드래그가 아니라 버튼이다 (AGENTS.md: 드래그 전용 조작 금지).
   * 서버 액션은 오래전부터 있었지만 이걸 누를 UI 가 없어 재정렬 자체가
   * 불가능했다. 그래서 "버튼이 실제로 순서를 바꾸는가" 를 화면에서 확인한다.
   */
  test("순서 이동 버튼이 같은 날 일정의 위아래를 바꾼다", async ({ page }) => {
    await createTrip(page, unique("순서"));
    const morning = unique("아침");
    const lunch = unique("점심");
    await addManualItem(page, morning, "2026-09-10T09:00");
    await addManualItem(page, lunch, "2026-09-10T12:00");

    const rows = page.locator('li[id^="item-"]');
    await expect(rows.nth(0)).toContainText(morning);

    await page.getByRole("button", { name: `${lunch} 순서 이동` }).click();
    await page.getByRole("button", { name: `${lunch} 위로 이동` }).click();

    await expect(rows.nth(0)).toContainText(lunch);
    await page.reload();
    await expect(rows.nth(0)).toContainText(lunch);
  });

  test("투표를 만들면 장소 검색으로 안내하고, 만든 사람은 삭제할 수 있다", async ({ page }) => {
    await createTrip(page, unique("투표삭제"));

    const pollTitle = unique("점심투표");
    await page.getByText("새 투표 만들기").click();
    const pollForm = page.locator('form:has(input[name="scheduledLocal"])');
    await pollForm.locator('input[name="title"]').fill(pollTitle);
    await pollForm.locator('input[name="location"]').fill("나주 혁신도시");
    await pollForm.getByRole("button", { name: "투표 만들기" }).click();

    // 투표를 만든 뒤 해당 투표의 상세 페이지로 이동한다.
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}\/polls\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: "장소 검색" })).toBeVisible();
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
