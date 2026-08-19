import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MainNav } from "@/components/layout/main-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

describe("MainNav", () => {
  it("현재 경로의 항목만 aria-current를 갖는다", () => {
    pathname.current = "/trips/new";
    render(<MainNav variant="tab" />);

    expect(screen.getByRole("link", { name: /새 여행/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /내 여행/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("루트에서는 내 여행이 활성이다", () => {
    pathname.current = "/";
    render(<MainNav variant="tab" />);

    expect(screen.getByRole("link", { name: /내 여행/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("스크린리더가 내비게이션 영역을 식별할 수 있다", () => {
    pathname.current = "/";
    render(<MainNav variant="bar" />);

    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
  });
});
