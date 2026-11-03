import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TripList } from "./trip-list";
import type { TripSummary } from "../types";

const base: TripSummary = {
  id: "1", title: "가을 산책", destinationName: "서울", startDate: "2026-11-03", endDate: "2026-11-05",
  timezone: "Asia/Seoul", status: "planning", coverImageUrl: null, deletedAt: null,
};
const trips = [base, { ...base, id: "2", title: "겨울 휴가", destinationName: "도쿄", startDate: "2026-12-01", endDate: "2026-12-05" }, { ...base, id: "3", title: "여름 휴가", startDate: "2026-07-01", endDate: "2026-07-05" }];

describe("여행 목록", () => {
  it("여행 중 → 예정 → 지난 여행 순서로 보여 주고 도시와 상태를 함께 검색한다", async () => {
    const user = userEvent.setup();
    render(<TripList trips={trips} now="2026-11-03T00:00:00Z" />);
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/trips/1", "/trips/2", "/trips/3"]);
    await user.type(screen.getByRole("searchbox"), "도쿄");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /지난 여행/ }));
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByText(/조건에 맞는 여행이 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
  it("시작일 최신순 정렬을 적용한다", async () => {
    const user = userEvent.setup();
    render(<TripList trips={trips} now="2026-11-03T00:00:00Z" />);
    await user.selectOptions(screen.getByRole("combobox"), "recent");
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/trips/2");
  });
});
