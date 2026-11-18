import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useViewChoice, viewChoiceKey } from "./use-view-choice";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
const key = viewChoiceKey("user", "trip", "date")!;
it("다시 열면 선택을 복원하고 사용자·여행이 바뀌면 분리한다", () => {
  const first = renderHook(() => useViewChoice(key, ""));
  act(() => first.result.current[1]("2026-11-21"));
  first.unmount();
  const next = renderHook(({ storageKey }) => useViewChoice(storageKey, ""), { initialProps: { storageKey: key } });
  expect(next.result.current[0]).toBe("2026-11-21");
  next.rerender({ storageKey: viewChoiceKey("other", "trip", "date")! });
  expect(next.result.current[0]).toBe("");
  next.rerender({ storageKey: viewChoiceKey("user", "other-trip", "date")! });
  expect(next.result.current[0]).toBe("");
});
it.each(["broken", JSON.stringify({ value: "old", at: 0 }), JSON.stringify({ value: "unknown", at: Date.now() })])("손상·만료·유효하지 않은 선택을 무시한다", raw => {
  sessionStorage.setItem(key, raw);
  const hook = renderHook(() => useViewChoice(key, "all", value => value === "all" || value === "planned"));
  expect(hook.result.current[0]).toBe("all");
});
it("저장 공간이 부족해도 이전 저장 값 대신 새 선택으로 동작한다", () => {
  sessionStorage.setItem(key, JSON.stringify({ value: "old", at: Date.now() }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  const hook = renderHook(() => useViewChoice(key, ""));
  act(() => hook.result.current[1]("new"));
  expect(hook.result.current[0]).toBe("new");
});
it("사용자 범위가 없으면 저장하지 않고 화면 안에서만 선택한다", () => {
  const hook = renderHook(() => useViewChoice(undefined, "all"));
  act(() => hook.result.current[1]("planned"));
  expect(hook.result.current[0]).toBe("planned");
  expect(sessionStorage.length).toBe(0);
});
