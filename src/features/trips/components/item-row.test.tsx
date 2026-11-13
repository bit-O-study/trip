import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ItemRow } from "./item-row";
import { TripBoard } from "./trip-board";
import { ToastProvider } from "@/components/ui/toast";
import { BulkDeleteProvider, BulkDeleteToolbar } from "./bulk-delete";
import type { ItineraryItem } from "../types";
import { tripDays } from "@/lib/datetime";

vi.mock("@/features/trips/actions", () => ({ deleteItemAction: vi.fn(), deleteItemsAction: vi.fn(), updateItemAction: vi.fn().mockResolvedValue({ status: "idle" }), restoreItemsAction: vi.fn().mockResolvedValue({ restored: 1 }) }));
vi.mock("@/features/trips/travel-actions", () => ({ saveTravelLeg: vi.fn() }));
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
const item: ItineraryItem = { id: "item-1", tripId: "trip-1", type: "food", status: "confirmed", title: "이치란 신주쿠", note: "상세 메모", locationText: "신주쿠 3초메", startAt: "2026-02-14T02:00:00Z", endAt: null, allDay: false, sortOrder: 1000, updatedAt: "2026-02-14T02:00:00Z", coordinate: { latitude: 35.69, longitude: 139.7 } };
const defaults = { item, order: 1, dayIndex: 0, timezone: "Asia/Tokyo", tripId: "trip-1", editable: true, days: tripDays("2026-02-14", "2026-02-16"), isFirst: true, isLast: true, dateKey: "2026-02-14" };
function setup(editable = true) {
  return render(<ToastProvider><TripBoard points={[]}><ol><ItemRow {...defaults} editable={editable} next={{ ...item, id: "next", title: "다음 장소" }} /></ol></TripBoard></ToastProvider>);
}
describe("일정 보기와 상세창", () => {
  it("세 보기에서 시간·장소를 유지하고 이동 정보와 메모만 구분한다", async () => {
    const user = userEvent.setup(); setup();
    expect(screen.getByText("11:00")).toBeInTheDocument();
    expect(screen.getByText("신주쿠 3초메")).toBeInTheDocument();
    expect(screen.queryByText("상세 메모")).not.toBeInTheDocument();
    expect(screen.queryByText(/이동수단 미입력/)).not.toBeInTheDocument();
    const select = screen.getByRole("combobox", { name: "일정 보기 방식" });
    await user.selectOptions(select, "travel");
    expect(screen.getByText(/이동수단 미입력/)).toBeInTheDocument();
    expect(screen.queryByText("상세 메모")).not.toBeInTheDocument();
    await user.selectOptions(select, "detailed");
    expect(screen.getByText("상세 메모")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "다음 일정과 이동" })).toBeInTheDocument();
  });
  it("목록에서 이동 조작을 제거하고 상세창 안에서 날짜와 시간을 수정한다", async () => {
    const user = userEvent.setup(); setup();
    expect(screen.queryByRole("button", { name: /순서|수정|삭제/ })).not.toBeInTheDocument();
    const opener = screen.getByRole("button", { name: "이치란 신주쿠 상세 보기" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("상세 메모")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "수정" }));
    expect(within(dialog).getByLabelText("시작")).toHaveValue("2026-02-14T11:00");
    expect(within(dialog).getByLabelText("장소")).toHaveValue("신주쿠 3초메");
    await user.click(within(dialog).getByRole("button", { name: "일정 상세 닫기" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("읽기 전용에서도 상세를 열지만 수정·삭제는 없다", async () => {
    const user = userEvent.setup(); setup(false);
    await user.click(screen.getByRole("button", { name: "이치란 신주쿠 상세 보기" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /수정|삭제/ })).not.toBeInTheDocument();
  });
  it("상세창에서 삭제한 일정은 알림으로 복구할 수 있다", async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole("button", { name: "이치란 신주쿠 상세 보기" }));
    await user.click(screen.getByRole("button", { name: "이치란 신주쿠 삭제" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "되돌리기" }));
    const { restoreItemsAction } = await import("../actions");
    expect(restoreItemsAction).toHaveBeenCalledWith("trip-1", ["item-1"]);
  });
  it("지도 선택은 상세창과 독립적으로 켜고 끈다", async () => {
    const user = userEvent.setup(); setup();
    const map = screen.getByRole("button", { name: "지도에서 보기: 이치란 신주쿠" });
    await user.click(map); expect(map).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(map); expect(map).toHaveAttribute("aria-pressed", "false");
  });
  it("기존 다중 선택 삭제 경로는 유지한다", async () => {
    const user = userEvent.setup();
    render(<BulkDeleteProvider tripId="trip-1" itemIds={[item.id]}><BulkDeleteToolbar /><ol><ItemRow {...defaults} /></ol></BulkDeleteProvider>);
    await user.click(screen.getByRole("checkbox", { name: "이치란 신주쿠 선택" }));
    expect(screen.getByRole("button", { name: "선택 일정 삭제" })).toBeEnabled();
  });
});
