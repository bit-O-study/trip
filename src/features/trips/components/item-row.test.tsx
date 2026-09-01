import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BulkDeleteProvider } from "@/features/trips/components/bulk-delete";
import { ItemRow } from "@/features/trips/components/item-row";
import { TripBoard } from "@/features/trips/components/trip-board";
import type { ItineraryItem } from "@/features/trips/types";

vi.mock("@/features/trips/actions", () => ({
  deleteItemAction: vi.fn(),
  deleteItemsAction: vi.fn(),
  updateItemAction: vi.fn().mockResolvedValue({ status: "idle" }),
}));

const TZ = "Asia/Tokyo";
function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return { id: "item-1", tripId: "trip-1", type: "food", status: "confirmed", title: "이치란 신주쿠", note: null, locationText: "신주쿠 3초메", startAt: "2026-02-14T02:00:00+00:00", endAt: null, allDay: false, sortOrder: 1000, updatedAt: "2026-02-14T02:00:00+00:00", coordinate: { latitude: 35.69, longitude: 139.7 }, ...overrides };
}

function renderRow(overrides: Partial<ItineraryItem> = {}, props: Record<string, unknown> = {}) {
  return render(<ol><ItemRow item={item(overrides)} order={2} dayIndex={0} timezone={TZ} tripId="trip-1" editable {...props} /></ol>);
}

describe("ItemRow", () => {
  it("여행 시간대로 시각을 표시한다", () => { renderRow(); expect(screen.getByText("11:00")).toBeInTheDocument(); });
  it("드래그와 순서 이동 버튼을 표시하지 않는다", () => { renderRow(); expect(screen.queryByText("드래그")).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /위로 이동|아래로 이동/ })).not.toBeInTheDocument(); });
  it("별도 날짜 이동 UI를 표시하지 않는다", () => { renderRow(); expect(screen.queryByRole("button", { name: /날짜 이동/ })).not.toBeInTheDocument(); expect(screen.queryByRole("combobox", { name: /날짜/ })).not.toBeInTheDocument(); });
  it("수정 폼에서 시작 날짜와 장소를 함께 바꿀 수 있다", async () => { const user = userEvent.setup(); renderRow(); await user.click(screen.getByRole("button", { name: "수정" })); expect(screen.getByLabelText("시작")).toHaveValue("2026-02-14T11:00"); expect(screen.getByLabelText("장소")).toHaveValue("신주쿠 3초메"); expect(screen.getByText(/해당 날짜의 일정으로 자동 이동/)).toBeInTheDocument(); });
  it("삭제 전에 확인한다", async () => { const confirm = vi.spyOn(window, "confirm").mockReturnValue(false); const user = userEvent.setup(); renderRow(); await user.click(screen.getByRole("button", { name: "이치란 신주쿠 삭제" })); expect(confirm).toHaveBeenCalledWith("'이치란 신주쿠' 일정을 삭제하시겠습니까?"); confirm.mockRestore(); });
  it("읽기 전용이면 편집 조작이 없다", () => { renderRow({}, { editable: false }); expect(screen.queryByRole("button", { name: "수정" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: /삭제/ })).not.toBeInTheDocument(); });
  it("좌표가 없으면 지도 연결 버튼이 없다", () => { renderRow({ coordinate: null }); expect(screen.queryByRole("button", { name: /지도에서 보기/ })).not.toBeInTheDocument(); });
  it("다중 선택 체크박스를 제공한다", async () => { const user = userEvent.setup(); render(<BulkDeleteProvider tripId="trip-1" itemIds={["item-1"]}><ol><ItemRow item={item()} order={1} dayIndex={0} timezone={TZ} tripId="trip-1" editable /></ol></BulkDeleteProvider>); await user.click(screen.getByRole("checkbox", { name: "이치란 신주쿠 선택" })); expect(screen.getByText("1개 선택")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "선택 일정 삭제" })).toBeEnabled(); });
});

describe("타임라인과 지도 선택", () => {
  it("항목을 다시 누르면 선택을 해제한다", async () => { const user = userEvent.setup(); render(<TripBoard points={[]}><ol><ItemRow item={item()} order={1} dayIndex={0} timezone={TZ} tripId="trip-1" editable={false} /></ol></TripBoard>); const button = screen.getByRole("button", { name: /지도에서 보기/ }); await user.click(button); expect(button).toHaveAttribute("aria-pressed", "true"); await user.click(button); expect(button).toHaveAttribute("aria-pressed", "false"); });
});
