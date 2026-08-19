import Link from "next/link";
import type { ReactNode } from "react";

import { MainNav } from "@/components/layout/main-nav";

type Props = {
  children: ReactNode;
};

/**
 * 모바일 우선 앱 셸.
 *
 * 작은 화면에서는 상단 바 + 하단 탭바, md 이상에서는 상단 바 안에 인라인 링크를 둔다.
 * 본문에는 하단 탭바 높이만큼 패딩을 넣어 마지막 항목이 탭에 가리지 않게 한다.
 */
export function AppShell({ children }: Props) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        본문으로 건너뛰기
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-base font-semibold tracking-tight">
            Trip Planner
          </Link>
          <MainNav variant="bar" />
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 md:pb-12">
        {children}
      </main>

      <MainNav variant="tab" />
    </div>
  );
}
