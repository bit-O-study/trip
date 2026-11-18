import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ShareLinkCopy } from "./share-link-manager";

vi.mock("./actions", () => ({ createShareLinkAction: vi.fn(), revokeShareLinkAction: vi.fn(), rotateShareLinkAction: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it("복사가 완료된 뒤에만 성공을 표시하고 새 링크에는 성공 상태를 넘기지 않는다", async () => {
  let finish!: () => void;
  const writeText = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const { rerender } = render(<ShareLinkCopy key="first" path="/share/first" />);
  fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
  expect(screen.getByRole("button", { name: "복사 중…" })).toBeDisabled();
  expect(writeText).toHaveBeenCalledWith(new URL("/share/first", window.location.origin).toString());
  await act(async () => finish());
  expect(screen.getByRole("button", { name: "복사했습니다" })).toBeEnabled();
  rerender(<ShareLinkCopy key="second" path="/share/second" />);
  expect(screen.getByRole("button", { name: "링크 복사" })).toBeEnabled();
});

it.each([undefined, { writeText: () => Promise.reject(new Error("denied")) }])("복사 미지원·권한 거부 시 직접 복사 안내를 표시한다", async clipboard => {
  vi.stubGlobal("navigator", { clipboard });
  render(<ShareLinkCopy path="/share/first" />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "링크 복사" })));
  expect(screen.getByRole("alert")).toHaveTextContent("직접 복사");
  expect(screen.queryByRole("button", { name: "복사했습니다" })).not.toBeInTheDocument();
});
