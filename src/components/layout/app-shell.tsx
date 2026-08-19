import Link from "next/link";
import type { ReactNode } from "react";

import { MainNav } from "@/components/layout/main-nav";
import type { CurrentUser } from "@/lib/supabase/user";

type Props = {
  children: ReactNode;
  user: CurrentUser | null;
};

/**
 * 모바일 우선 앱 셸.
 *
 * 작은 화면에서는 상단 바 + 하단 탭바, md 이상에서는 상단 바 안에 인라인 링크를 둔다.
 * 로그인하지 않은 방문자에게는 내비게이션을 숨긴다 — 어차피 모든 대상이 보호된
 * 경로라 눌러도 로그인 페이지로 되돌아온다.
 */
export function AppShell({ children, user }: Props) {
  const isAuthenticated = user !== null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Trip Planner
          </Link>

          <div className="flex items-center gap-2">
            {isAuthenticated ? <MainNav variant="bar" /> : null}

            {isAuthenticated ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  로그아웃
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        id="main"
        className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-6 ${
          isAuthenticated ? "pb-24 md:pb-12" : "pb-12"
        }`}
      >
        {children}
      </main>

      {isAuthenticated ? <MainNav variant="tab" /> : null}
    </div>
  );
}
