import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ItemRow } from "@/features/trips/components/item-row";
import { TripBoard } from "@/features/trips/components/trip-board";
import type { ItineraryItem } from "@/features/trips/types";

/*
 * 서버 액션은 "use server" 파일이라 그대로 import 하면 next/headers 까지 끌려온다.
 * 여기서 검증하려는 것은 폼이 어떤 값을 들고 어떤 액션을 가리키는지이지
 * 액션의 내부 동작이 아니다.
 */
vi.mock("@/features/trips/actions", () => ({
  deleteItemAction: vi.fn(),
  moveItemUpAction: vi.fn(),
  moveItemDownAction: vi.fn(),
  moveItemToDayAction: vi.fn(),
}));

const TZ = "Asia/Tokyo";

function item(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: "item-1",
    tripId: "trip-1",
    type: "food",
    status: "confirmed",
    title: "이치란 라멘",
    note: null,
    locationText: "신주쿠 3초메",
    startAt: "2026-02-14T02:00:00+00:00",
    endAt: null,
    allDay: false,
    sortOrder: 1000,
    updatedAt: "2026-02-14T02:00:00+00:00",
    coordinate: { latitude: 35.69, longitude: 139.7 },
    ...overrides,
  };
}

const DAY_OPTIONS = [
  { date: "2026-02-14", label: "Day 1 · 2/14(토)" },
  { date: "2026-02-15", label: "Day 2 · 2/15(일)" },
];

function renderRow(overrides: Partial<ItineraryItem> = {}, props: Record<string, unknown> = {}) {
  return render(
    <ol>
      <ItemRow
        item={item(overrides)}
        order={2}
        dayIndex={0}
        timezone={TZ}
        tripId="trip-1"
        editable
        canMoveUp
        canMoveDown
        dayOptions={DAY_OPTIONS}
        currentDate="2026-02-14"
        {...props}
      />
    </ol>,
  );
}

describe("ItemRow", () => {
  it("시각을 여행 시간대로 보여 준다", () => {
    // 02:00Z 는 도쿄에서 11:00 이다. UTC 그대로 찍으면 하루 종일 어긋난다.
    renderRow();
    expect(screen.getByText("11:00")).toBeInTheDocument();
  });

  it("드래그 없이 순서를 바꿀 수 있다", () => {
    renderRow();
    expect(screen.getByRole("button", { name: /위로 이동/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /아래로 이동/ })).toBeEnabled();
  });

  it("맨 위·맨 아래에서는 이동 버튼이 비활성이다", () => {
    renderRow({}, { canMoveUp: false, canMoveDown: false });
    expect(screen.getByRole("button", { name: /위로 이동/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /아래로 이동/ })).toBeDisabled();
  });

  it("날짜 이동 목록에 여행의 모든 날이 있다", () => {
    renderRow();
    const select = screen.getByRole("combobox", { name: /날짜 변경/ });
    expect(select).toHaveValue("2026-02-14");
    expect(screen.getByRole("option", { name: "Day 2 · 2/15(일)" })).toBeInTheDocument();
  });

  it("기간 밖 항목은 현재 날짜를 선택지에 함께 넣는다", () => {
    // 없으면 select 가 첫 옵션으로 튀어 사용자가 고르지도 않은 날로 옮겨진다.
    renderRow(
      { startAt: "2026-03-01T02:00:00+00:00" },
      { dayIndex: null, currentDate: "2026-03-01" },
    );
    const select = screen.getByRole("combobox", { name: /날짜 변경/ });
    expect(select).toHaveValue("2026-03-01");
    expect(screen.getByRole("option", { name: /기간 밖/ })).toBeInTheDocument();
  });

  it("읽기 전용이면 편집 조작이 없다", () => {
    renderRow({}, { editable: false });
    expect(screen.queryByRole("button", { name: /위로 이동/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제/ })).not.toBeInTheDocument();
  });

  it("좌표가 없으면 지도 연결 버튼을 만들지 않는다", () => {
    // 누를 수는 있는데 지도에서 아무 일도 안 일어나는 버튼은 없는 것만 못하다.
    renderRow({ coordinate: null });
    expect(screen.queryByRole("button", { name: /지도에서 보기/ })).not.toBeInTheDocument();
  });
});

describe("타임라인 ↔ 지도 선택", () => {
  function renderBoard() {
    return render(
      <TripBoard points={[]}>
        <ol>
          <ItemRow
            item={item()}
            order={1}
            dayIndex={0}
            timezone={TZ}
            tripId="trip-1"
            editable={false}
            canMoveUp={false}
            canMoveDown={false}
            dayOptions={DAY_OPTIONS}
            currentDate="2026-02-14"
          />
        </ol>
      </TripBoard>,
    );
  }

  it("항목을 누르면 선택되고 다시 누르면 풀린다", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = screen.getByRole("button", { name: /지도에서 보기/ });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");

    // 해제 경로가 없으면 한번 켠 강조를 되돌릴 수 없다.
    await user.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("Esc 로 선택을 푼다", async () => {
    const user = userEvent.setup();
    renderBoard();

    const button = screen.getByRole("button", { name: /지도에서 보기/ });
    await user.click(button);
    await user.keyboard("{Escape}");

    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("지도 키가 없으면 목록 전용으로 폴백하고 일정은 그대로 보인다", () => {
    // 지도가 죽어도 앱 전체가 죽으면 안 된다.
    renderBoard();
    expect(screen.getByRole("button", { name: /지도에서 보기/ })).toBeInTheDocument();
  });
});
