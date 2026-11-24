import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { PackingList } from "./packing-list";
import type { PackingItem } from "./model";

const { manage, refresh } = vi.hoisted(() => ({ manage: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ managePackingItem: manage }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const item: PackingItem = { id: "item-one", title: "여권", category: "기타", checked: true, updated_at: "original-version" };
beforeEach(() => vi.clearAllMocks());

it("이름과 기본 분류를 수정하며 체크 상태와 편집 시작 버전을 보존한다", async () => {
  const user = userEvent.setup();
  manage.mockResolvedValue({ ok: true, message: "저장 완료" });
  const view = render(<PackingList tripId="trip-one" items={[item]} editable />);
  await user.click(screen.getByRole("button", { name: "여권 수정" }));
  await user.clear(screen.getByLabelText("준비물 이름"));
  await user.type(screen.getByLabelText("준비물 이름"), "여권과 사본");
  await user.selectOptions(screen.getByLabelText("수정할 분류"), "서류·결제");
  view.rerender(<PackingList tripId="trip-one" items={[{ ...item, updated_at: "new-version", checked: false }]} editable />);
  await user.click(screen.getByRole("button", { name: "수정 저장" }));
  expect(manage).toHaveBeenCalledWith({ tripId: "trip-one", action: "save", id: item.id, expected: "original-version", data: { title: "여권과 사본", category: "서류·결제", checked: true } });
  expect(refresh).toHaveBeenCalled();
  expect(screen.queryByLabelText("준비물 이름")).not.toBeInTheDocument();
});

it("충돌 후 직접 입력한 분류와 이름을 유지하고 취소 시 저장하지 않는다", async () => {
  const user = userEvent.setup();
  manage.mockResolvedValue({ ok: false, message: "다른 곳에서 변경되었습니다" });
  render(<PackingList tripId="trip-one" items={[item]} editable />);
  await user.click(screen.getByRole("button", { name: "여권 수정" }));
  await user.selectOptions(screen.getByLabelText("수정할 분류"), "");
  await user.type(screen.getByLabelText("수정할 새 분류 이름"), "출국 준비");
  await user.click(screen.getByRole("button", { name: "수정 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 곳에서 변경되었습니다");
  expect(screen.getByLabelText("수정할 새 분류 이름")).toHaveValue("출국 준비");
  expect(screen.getByLabelText("준비물 이름")).toHaveValue("여권");
  expect(refresh).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "수정 취소" }));
  expect(manage).toHaveBeenCalledTimes(1);
  expect(screen.queryByLabelText("준비물 이름")).not.toBeInTheDocument();
});

it("읽기 전용에서는 수정 작업을 제공하지 않는다", () => {
  render(<PackingList tripId="trip-one" items={[item]} editable={false} />);
  expect(screen.queryByRole("button", { name: "여권 수정" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "여권" })).toBeDisabled();
});
