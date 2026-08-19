"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

import { PlusCircleIcon, SuitcaseIcon } from "@/components/icons";
import { NAV_ITEMS, isNavItemActive } from "@/lib/nav";

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  "/": SuitcaseIcon,
  "/trips/new": PlusCircleIcon,
};

type Props = {
  /**
   * "tab"  — 모바일 하단 탭바
   * "bar"  — 데스크톱 상단 인라인 링크
   *
   * 한 컴포넌트로 둘을 처리하는 이유는 활성 판정 로직이 갈라지면
   * 두 내비게이션이 서로 다른 항목을 활성으로 표시하기 때문이다.
   */
  variant: "tab" | "bar";
};

export function MainNav({ variant }: Props) {
  const pathname = usePathname();

  if (variant === "bar") {
    return (
      <nav
        aria-label="주요 메뉴"
        data-testid="main-nav-bar"
        className="hidden md:block"
      >
        <ul className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label="주요 메뉴"
      data-testid="main-nav-tab"
      /*
       * 홈 인디케이터가 있는 기기에서 탭이 가려지지 않도록 safe-area만큼 더 띄운다.
       * viewport의 viewportFit: "cover" 와 짝을 이룬다.
       */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          const Icon = ICONS[item.href];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.description}
                /* min-h-14: 터치 타깃 최소 크기 확보 */
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {Icon ? <Icon className="size-6" /> : null}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
