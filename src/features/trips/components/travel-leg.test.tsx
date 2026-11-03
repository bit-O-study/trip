import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { TravelLegView } from "./travel-leg";
import type { TravelLeg } from "../travel";
import { travelConflictMinutes } from "../travel";
vi.mock("@/features/trips/travel-actions", () => ({ saveTravelLeg: vi.fn() }));
const from = { id: "a", title: "출발", locationText: null, coordinate: { latitude: 37, longitude: 127 } };
const to = { id: "b", title: "도착", locationText: null, coordinate: { latitude: 38, longitude: 128 } };
const leg: TravelLeg = { tripId: "trip", fromId: "a", toId: "b", mode: "train", minutes: 90, distanceKm: 200, version: 1, fromLocationKey: "37,127", toLocationKey: "38,128" };
it("warns only when known times and current locations prove a conflict", () => {
  const departure = { ...from, endAt: "2026-11-03T01:00:00Z" };
  const arrival = { ...to, startAt: "2026-11-03T02:00:00Z" };
  expect(travelConflictMinutes(departure, arrival, leg)).toBe(30);
  expect(travelConflictMinutes(departure, { ...arrival, allDay: true }, leg)).toBeNull();
  expect(travelConflictMinutes(departure, arrival, { ...leg, minutes: null })).toBeNull();
  expect(travelConflictMinutes(departure, arrival, { ...leg, fromLocationKey: "old" })).toBeNull();
  expect(travelConflictMinutes(departure, { ...arrival, startAt: "2026-11-03T03:00:00Z" }, leg)).toBeNull();
  render(<TravelLegView tripId="trip" from={departure} to={arrival} leg={leg} editable={false} direction="next" />);
  expect(screen.getByRole("status")).toHaveTextContent("30분 부족합니다");
});
it("shows saved travel distance, mode and duration without edit controls for viewers", () => {
  render(<TravelLegView tripId="trip" from={from} to={to} leg={leg} editable={false} direction="next" />);
  expect(screen.getByText("입력한 이동거리 200km")).toBeInTheDocument();
  expect(screen.getByText("기차")).toBeInTheDocument();
  expect(screen.getByText("1시간 30분")).toBeInTheDocument();
  expect(screen.queryByText("이동 정보 수정")).not.toBeInTheDocument();
});
it("invalidates manually entered distance when an endpoint changes", () => {
  render(<TravelLegView tripId="trip" from={from} to={{ ...to, coordinate: from.coordinate }} leg={leg} editable direction="previous" />);
  expect(screen.getByText("직선거리 0m")).toBeInTheDocument();
  expect(screen.getByText(/장소가 바뀌었습니다/)).toBeInTheDocument();
  expect(screen.queryByText("입력한 이동거리 200km")).not.toBeInTheDocument();
});
