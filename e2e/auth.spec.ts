import { expect, test } from "@playwright/test";

test.describe("경로 보호", () => {
  test("여행 목록은 로그인 페이지로 보낸다", async ({ page }) => {
    await page.goto("/");

    // 루트로 돌아올 때는 next 를 붙이지 않는다.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "로그인", level: 1 })).toBeVisible();
  });

  test("보호된 경로는 next 를 붙여 로그인 페이지로 보낸다", async ({ page }) => {
    await page.goto("/trips/new");

    await expect(page).toHaveURL(/\/login\?next=%2Ftrips%2Fnew$/);
  });

  test("쿼리스트링까지 보존한다", async ({ page }) => {
    await page.goto("/trips/abc?day=2");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/trips/abc?day=2");
  });

  test("공개 경로는 리다이렉트하지 않는다", async ({ page }) => {
    for (const path of ["/login", "/auth/auth-code-error"]) {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
    }
  });
});

test.describe("오픈 리다이렉트 방지", () => {
  /*
   * 문서 HTML 전체를 문자열로 검사하면 안 된다. 지금 보고 있는 주소는 Next 의
   * 라우터 상태(RSC 페이로드)에 정상적으로 실리므로 "evil.example" 이 문서에
   * 나타나는 것 자체는 취약점이 아니다.
   *
   * 실제로 위험한 것은 페이지의 링크나 폼이 공격자 주소로 향하는 경우다.
   * next 값의 정규화 로직은 src/lib/auth/redirect.test.ts 가 검증한다.
   */
  async function externalTargets(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const targets = [
        ...Array.from(document.querySelectorAll("a")).map((el) => el.getAttribute("href")),
        ...Array.from(document.querySelectorAll("form")).map((el) =>
          el.getAttribute("action"),
        ),
      ].filter((value): value is string => Boolean(value));

      return targets.filter((value) => {
        try {
          return new URL(value, window.location.origin).origin !== window.location.origin;
        } catch {
          return false;
        }
      });
    });
  }

  test("절대 URL 을 next 로 넘겨도 외부로 향하는 링크가 생기지 않는다", async ({ page }) => {
    await page.goto("/login?next=https://evil.example/steal");

    await expect(page.getByRole("heading", { name: "로그인", level: 1 })).toBeVisible();
    expect(await externalTargets(page)).toEqual([]);
  });

  test("프로토콜 상대 URL 도 마찬가지다", async ({ page }) => {
    await page.goto("/login?next=//evil.example");

    await expect(page.getByRole("heading", { name: "로그인", level: 1 })).toBeVisible();
    expect(await externalTargets(page)).toEqual([]);
  });
});

test.describe("로그아웃", () => {
  test("GET 으로는 로그아웃할 수 없다", async ({ request }) => {
    // GET 으로 로그아웃되면 <img src="/auth/signout"> 만으로 남을 로그아웃시킬 수 있다.
    const response = await request.get("/auth/signout", { maxRedirects: 0 });
    expect(response.status()).toBe(405);
  });
});
