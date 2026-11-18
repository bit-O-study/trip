import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TravelLegView } from "./travel-leg";
import type { TravelLeg } from "../travel";
import { scheduleOverlapMinutes, travelConflictMinutes } from "../travel";
vi.mock("@/features/trips/travel-actions", () => ({ saveTravelLeg: vi.fn() }));
const from = { id: "a", title: "출발", locationText: null, coordinate: { latitude: 37, longitude: 127 } };
const to = { id: "b", title: "도착", locationText: null, coordinate: { latitude: 38, longitude: 128 } };
const leg: TravelLeg = { tripId: "trip", fromId: "a", toId: "b", mode: "train", minutes: 90, distanceKm: 200, version: 1, fromLocationKey: "37,127", toLocationKey: "38,128" };
const first = { ...from, startAt: "2026-11-21T07:30:00Z", endAt: "2026-11-21T09:30:00Z" };
const second = { ...to, startAt: "2026-11-21T09:00:00Z", endAt: "2026-11-21T10:00:00Z" };
it("이동시간 없이도 겹침을 안내하고 포함 구간·시간대·날짜 경계를 정확히 계산한다", () => {
  expect(scheduleOverlapMinutes(first, second)).toBe(30);
  expect(scheduleOverlapMinutes(first, { ...second, endAt: "2026-11-21T09:10:00Z" })).toBe(10);
  expect(scheduleOverlapMinutes(first, { ...second, startAt: "2026-11-21T17:00:00+08:00" })).toBe(30);
  expect(scheduleOverlapMinutes({ ...first, startAt: "2026-11-21T23:00:00Z", endAt: "2026-11-22T01:00:00Z" }, { ...second, startAt: "2026-11-22T00:30:00Z", endAt: "2026-11-22T02:00:00Z" })).toBe(30);
  render(<TravelLegView tripId="trip" from={first} to={second} editable={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("두 일정이 30분 겹칩니다");
});
it("맞닿은 시각·잘못된 구간·숙박·종일·취소·후보 일정은 겹침으로 표시하지 않는다", () => {
  expect(scheduleOverlapMinutes(first, { ...second, startAt: first.endAt })).toBeNull();
  for (const patch of [{ endAt: null }, { startAt: "invalid" }, { endAt: second.startAt }, { allDay: true }, { type: "lodging" as const }, { status: "cancelled" as const }, { status: "candidate" as const }]) {
    expect(scheduleOverlapMinutes(first, { ...second, ...patch })).toBeNull();
    expect(scheduleOverlapMinutes({ ...second, ...patch }, first)).toBeNull();
  }
});
it("버스·지하철·배·비행기를 선택하고 수단별 번호·노선·편명을 입력한다", async () => {
  const user = userEvent.setup();
  render(<TravelLegView tripId="trip" from={from} to={to} editable />);
  await user.click(screen.getByText("이동수단 추가"));
  const mode = await screen.findByLabelText("이동수단", {exact:true});
  for (const [value, placeholder] of [["bus","예: 88번, 100번"],["subway","예: 2호선, 레드라인"],["ferry","예: 구산–치진 페리, 선박명"],["flight","예: CI165, KE185"]]) {
    await user.selectOptions(mode, value);
    expect(screen.getByLabelText("번호·노선·편명 (선택)")).toHaveAttribute("placeholder", placeholder);
  }
});
it("warns only when known times and current locations prove a conflict", () => {
  const departure = { ...from, endAt: "2026-11-03T01:00:00Z" };
  const arrival = { ...to, startAt: "2026-11-03T02:00:00Z" };
  expect(travelConflictMinutes(departure, arrival, leg)).toBe(30);
  expect(travelConflictMinutes(departure, { ...arrival, allDay: true }, leg)).toBeNull();
  expect(travelConflictMinutes(departure, arrival, { ...leg, minutes: null })).toBeNull();
  expect(travelConflictMinutes(departure, arrival, { ...leg, fromLocationKey: "old" })).toBeNull();
  expect(travelConflictMinutes(departure, { ...arrival, startAt: "2026-11-03T03:00:00Z" }, leg)).toBeNull();
  render(<TravelLegView tripId="trip" from={departure} to={arrival} leg={leg} editable={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("30분 부족합니다");
});
it("shows saved travel distance, mode and duration without edit controls for viewers", () => {
  render(<TravelLegView tripId="trip" from={from} to={to} leg={leg} editable={false} />);
  expect(screen.getByText("기차 · 1시간 30분")).toBeInTheDocument();
  expect(screen.queryByText("이동 정보 수정")).not.toBeInTheDocument();
});
it("invalidates manually entered distance when an endpoint changes", () => {
  render(<TravelLegView tripId="trip" from={from} to={{ ...to, coordinate: from.coordinate }} leg={leg} editable />);
  expect(screen.getByText(/장소가 바뀌었습니다/)).toBeInTheDocument();
  expect(screen.queryByText("입력한 이동거리 200km")).not.toBeInTheDocument();
});
