import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";
function Trigger({ action }: { action: () => Promise<void> }) {
  const toast = useToast();
  return <button onClick={() => toast.show({ message: "삭제했습니다", actionLabel: "되돌리기", onAction: action })}>알림</button>;
}
afterEach(() => vi.useRealTimers());
it("느린 되돌리기 동안 알림이 유지되고 중복 실행을 막는다", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const action = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<ToastProvider><Trigger action={action} /></ToastProvider>);
  fireEvent.click(screen.getByText("알림"));fireEvent.click(screen.getByText("되돌리기"));
  act(() => vi.advanceTimersByTime(8000));
  expect(screen.getByRole("button", { name: "처리 중…" })).toBeDisabled();
  expect(action).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("실패하면 오류와 재시도 버튼을 남긴다", async () => {
  render(<ToastProvider><Trigger action={() => Promise.reject(new Error("network"))} /></ToastProvider>);
  fireEvent.click(screen.getByText("알림"));
  await act(async () => fireEvent.click(screen.getByText("되돌리기")));
  expect(screen.getByRole("status")).toHaveTextContent("처리하지 못했습니다");
  expect(screen.getByRole("button", { name: "되돌리기" })).toBeEnabled();
});