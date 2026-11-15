import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TripBoard, DayFilter, DayContent } from "./trip-board";

vi.mock("@/features/map/trip-map", () => ({
  TripMap: ({ points }: { points: { id: string }[] }) => <div data-testid="map">{points.map((point) => point.id).join(",")}</div>,
}));

describe("여행 날짜 필터", () => {
  it("날짜를 고르면 지도와 일정이 함께 좁혀지고 모두로 복원된다", () => {
    const days = [
      { date: "2026-11-15", index: 0, shortLabel: "11/15", weekday: "일" },
      { date: "2026-11-16", index: 1, shortLabel: "11/16", weekday: "월" },
      { date: "2026-11-17", index: 2, shortLabel: "11/17", weekday: "화" },
    ];
    render(<TripBoard points={days.slice(0, 2).map((day) => ({ id: `point${day.index}`, title: "장소", date: day.date, dayIndex: day.index, latitude: 37, longitude: 127, order: 1 }))}>
      <DayFilter days={days} today="2026-11-16" />
      {days.map((day) => <DayContent key={day.date} date={day.date}><p>일정{day.index}</p></DayContent>)}
      <DayContent date={null}><p>기간 밖 일정</p></DayContent>
    </TripBoard>);
    fireEvent.click(screen.getByRole("button", { name: /Day 1/ }));
    expect(screen.getByTestId("map").textContent).toBe("point0");
    expect(screen.queryByText("일정1")).toBeNull();
    expect(screen.queryByText("기간 밖 일정")).toBeNull();
    expect(screen.getByRole("button", { name: /Day 1/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "오늘" }));
    expect(screen.getByTestId("map").textContent).toBe("point1");
    expect(screen.queryByText("일정0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Day 3/ }));
    expect(screen.getByTestId("map").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "모두" }));
    expect(screen.getByTestId("map").textContent).toBe("point0,point1");
    expect(screen.getByText("일정0")).toBeTruthy();
    expect(screen.getByText("일정1")).toBeTruthy();
    expect(screen.getByText("기간 밖 일정")).toBeTruthy();
  });
});
