import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ShareLinkCopy, ShareLinkManager } from "./share-link-manager";
import { createShareLinkAction, rotateShareLinkAction } from "./actions";

vi.mock("./actions", () => ({ createShareLinkAction: vi.fn(), revokeShareLinkAction: vi.fn(), rotateShareLinkAction: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

it("재발급 뒤 다시 생성하면 가장 최근 링크를 표시하고 재발급 실패도 보여준다", async () => {
  vi.mocked(createShareLinkAction).mockResolvedValueOnce({ status: "success", sharePath: "/share/first" }).mockResolvedValueOnce({ status: "success", sharePath: "/share/latest" });
  vi.mocked(rotateShareLinkAction).mockResolvedValueOnce({ status: "success", sharePath: "/share/rotated" }).mockResolvedValueOnce({ status: "error", message: "재발급 실패" });
  render(<ShareLinkManager tripId="trip" readable links={[{ id: "link", shortId: "short", expiresAt: null, revokedAt: null, lastAccessedAt: null, accessCount: 0, createdAt: "2026-11-18" }]} />);
  async function submit(name: string) { await act(async () => fireEvent.submit(screen.getByRole("button", { name }).closest("form")!)); }
  await submit("공유 링크 만들기");
  expect(screen.getByLabelText("공개 공유 링크")).toHaveValue(new URL("/share/first", window.location.origin).toString());
  await submit("링크 새로 발급(기존 폐기)");
  expect(screen.getByLabelText("공개 공유 링크")).toHaveValue(new URL("/share/rotated", window.location.origin).toString());
  await submit("공유 링크 만들기");
  expect(screen.getByLabelText("공개 공유 링크")).toHaveValue(new URL("/share/latest", window.location.origin).toString());
  await submit("링크 새로 발급(기존 폐기)");
  expect(screen.getByRole("alert")).toHaveTextContent("재발급 실패");
  expect(screen.queryByLabelText("공개 공유 링크")).not.toBeInTheDocument();
});

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
