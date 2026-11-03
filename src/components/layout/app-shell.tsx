import Link from "next/link";
import type { ReactNode } from "react";

import { MainNav } from "@/components/layout/main-nav";
import { ToastProvider } from "@/components/ui/toast";
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
    <ToastProvider>
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
            {/* 노선도 모양 로고: 두 정거장을 잇는 선 */}
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <path d="M5 17h5a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h3" />
                <circle cx="5" cy="17" r="1.6" fill="currentColor" stroke="none" />
                <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </span>
            Trip Planner
          </Link>

          <div className="flex items-center gap-2">
            {isAuthenticated ? <MainNav variant="bar" /> : null}

            {isAuthenticated ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  로그아웃
                </button>
              </form>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                로그인
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        id="main"
        className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-7 ${
          isAuthenticated ? "pb-24 md:pb-12" : "pb-12"
        }`}
      >
        {children}
      </main>

      {/*
        법적 고지는 로그인 여부와 무관하게 어디서나 닿을 수 있어야 한다.
        모바일에서는 하단 탭바에 가리지 않도록 여백을 둔다.
      */}
      <footer className={`mx-auto w-full max-w-5xl px-4 pb-6 ${isAuthenticated ? "pb-24 md:pb-6" : ""}`}>
        <nav aria-label="약관" className="flex flex-wrap gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
          <Link href="/legal/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/legal/location" className="hover:underline">위치정보 이용 고지</Link>
        </nav>
      </footer>

      {isAuthenticated ? <MainNav variant="tab" /> : null}
    </div>
    </ToastProvider>
  );
}
