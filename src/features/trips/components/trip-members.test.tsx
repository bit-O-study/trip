import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/features/trips/member-actions", () => ({
  leaveTripAction: vi.fn(),
  removeMemberAction: vi.fn(),
  updateMemberRoleAction: vi.fn(),
}));

import { TripMembers, safeAvatarSrc } from "./trip-members";

const base = { userId: "u1", displayName: "김여행", role: "owner" as const, joinedAt: "2026-10-01" };

it("아바타는 CSS 배경이 아니라 no-referrer <img> 로 그린다", () => {
  const { container } = render(
    <TripMembers members={[{ ...base, avatarUrl: "https://lh3.googleusercontent.com/a/x=s96-c" }]} />,
  );
  const img = container.querySelector("img");
  expect(img?.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/x=s96-c");
  expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(container.innerHTML).not.toMatch(/background-image/i);
});

it("https 가 아닌 아바타는 버리고 이니셜을 보여 준다", () => {
  for (const bad of ["javascript:alert(1)", "http://k.kakaocdn.net/a.jpg", "a.png) , url(https://t.test/p"]) {
    expect(safeAvatarSrc(bad)).toBeNull();
  }
  const { container } = render(<TripMembers members={[{ ...base, avatarUrl: "javascript:alert(1)" }]} />);
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toContain("김여");
});
