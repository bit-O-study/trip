import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ExpenseBook } from "./expense-book";
import { draftKey, readDraft } from "./draft";
import type { Expense } from "./model";

const mocks = vi.hoisted(() => ({ manage: vi.fn(), refresh: vi.fn() }));
vi.mock("./actions", () => ({ manageExpense: mocks.manage }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const row: Expense = { id: "one", title: "택시", category: "교통", spent_on: "2026-11-18", amount_minor: 30000, currency: "TWD", note: "", updated_at: "2026-11-18T00:00:00Z" };
const props = { tripId: "trip-one", draftOwner: "user-one", expenses: [row], editable: true, currency: "TWD", defaultDate: "2026-11-18" };
beforeEach(() => {
  sessionStorage.clear(); vi.clearAllMocks(); mocks.manage.mockResolvedValue({ ok: true, message: "저장 완료" });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  Element.prototype.scrollIntoView = vi.fn();
});
it("처음에는 내역을 보여주고 새로 연 화면에서 임시 작성 내용을 복원한다", async () => {
  const user = userEvent.setup();
  const first = render(<ExpenseBook {...props} />);
  expect(screen.queryByLabelText("지출명")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  await user.type(screen.getByLabelText("지출명"), "점심 작성 중");
  first.unmount();
  render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  expect(screen.getByLabelText("지출명")).toHaveValue("점심 작성 중");
  expect(readDraft(draftKey("another-user", props.tripId))).toBeNull();
});
it("다른 지출을 삭제해도 입력 중인 내용과 임시 저장을 유지한다", async () => {
  const user = userEvent.setup(); render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  await user.type(screen.getByLabelText("지출명"), "작성 중인 저녁");
  await user.click(screen.getByRole("button", { name: "택시 삭제" }));
  await user.click(screen.getByRole("button", { name: "삭제 확인" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(screen.getByLabelText("지출명")).toHaveValue("작성 중인 저녁");
  expect(readDraft(draftKey(props.draftOwner, props.tripId))?.fields.title).toBe("작성 중인 저녁");
});
it("저장 후 연속 입력할 날짜·통화·카테고리를 유지하고 임시 저장은 지운다", async () => {
  const user = userEvent.setup(); render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  await user.type(screen.getByLabelText("지출명"), "기념품");
  await user.type(screen.getByLabelText("금액"), "1,000");
  fireEvent.change(screen.getByLabelText("사용 날짜"), { target: { value: "2026-11-20" } });
  await user.selectOptions(screen.getByLabelText("통화"), "KRW");
  const category = screen.getByRole("combobox", { name: "카테고리" });
  await user.selectOptions(category, "쇼핑");
  await user.click(screen.getByRole("button", { name: "지출 저장" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  expect(mocks.manage).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount_minor: 1000, category: "쇼핑" }) }));
  expect(readDraft(draftKey(props.draftOwner, props.tripId))).toBeNull();
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  expect(screen.getByLabelText("지출명")).toHaveValue("");
  expect(screen.getByLabelText("사용 날짜")).toHaveValue("2026-11-20");
  expect(screen.getByLabelText("통화")).toHaveValue("KRW");
  expect(screen.getByRole("combobox", { name: "카테고리" })).toHaveValue("쇼핑");
});
it("직접 입력한 카테고리를 초안에 보관하고 기본 분류로 다시 바꿔 저장한다", async () => {
  const user = userEvent.setup(); const first = render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  await user.selectOptions(screen.getByLabelText("카테고리", { exact: true }), "");
  await user.type(screen.getByLabelText("새 카테고리 이름"), "통신");
  expect(readDraft(draftKey(props.draftOwner, props.tripId))?.fields.category).toBe("통신");
  first.unmount(); render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  expect(screen.getByLabelText("새 카테고리 이름")).toHaveValue("통신");
  await user.selectOptions(screen.getByLabelText("카테고리", { exact: true }), "교통");
  expect(readDraft(draftKey(props.draftOwner, props.tripId))?.fields.category).toBe("교통");
  expect(screen.queryByLabelText("새 카테고리 이름")).not.toBeInTheDocument();
});
it("수정 초안 복원은 원래 버전을 보내 충돌을 덮어쓰지 않는다", async () => {
  const user = userEvent.setup(); const first = render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "택시 수정" }));
  await user.type(screen.getByLabelText("지출명"), " 수정 중");
  first.unmount();
  render(<ExpenseBook {...props} expenses={[{ ...row, updated_at: "2026-11-19T00:00:00Z" }]} />);
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  mocks.manage.mockResolvedValueOnce({ ok: false, message: "다른 곳에서 변경됨" });
  await user.click(screen.getByRole("button", { name: "변경 저장" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("다른 곳에서 변경됨");
  expect(mocks.manage).toHaveBeenCalledWith(expect.objectContaining({ expected: row.updated_at, id: row.id }));
  expect(screen.getByLabelText("지출명")).toHaveValue("택시 수정 중");
});

it("수정 화면을 접었다 이어써도 새 지출로 바뀌어 중복 저장되지 않는다", async () => {
  const user = userEvent.setup(); render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "택시 수정" }));
  // 아직 값을 바꾸지 않아 초안이 없는 상태에서도 수정 대상은 유지해야 한다.
  await user.click(screen.getByRole("button", { name: "접기" }));
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  expect(screen.getByRole("heading", { name: "지출 수정" })).toBeInTheDocument();
  expect(screen.getByLabelText("지출명")).toHaveValue("택시");
  await user.clear(screen.getByLabelText("금액"));
  await user.type(screen.getByLabelText("금액"), "350");
  await user.click(screen.getByRole("button", { name: "변경 저장" }));
  expect(mocks.manage).toHaveBeenCalledWith(expect.objectContaining({ id: row.id, expected: row.updated_at, data: expect.objectContaining({ amount_minor: 35000 }) }));
});

it("열려 있는 수정 화면에서 이어쓰기를 눌러도 기존 지출을 수정한다", async () => {
  const user = userEvent.setup(); render(<ExpenseBook {...props} />);
  await user.click(screen.getByRole("button", { name: "택시 수정" }));
  await user.click(screen.getByRole("button", { name: "지출 추가 / 이어쓰기" }));
  expect(screen.getByRole("heading", { name: "지출 수정" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "변경 저장" }));
  expect(mocks.manage).toHaveBeenCalledWith(expect.objectContaining({ id: row.id, expected: row.updated_at }));
});
