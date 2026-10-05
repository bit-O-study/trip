import { describe, expect, it } from "vitest";
import { distanceLabel, durationLabel, straightDistanceKm, travelInput } from "./travel";

describe("일정 사이 거리와 이동 입력", () => {
  it("동일 좌표는 0, 런던-파리는 약 344km다", () => {
    const london = { latitude: 51.5074, longitude: -0.1278 };
    expect(straightDistanceKm(london, london)).toBe(0);
    expect(straightDistanceKm(london, { latitude: 48.8566, longitude: 2.3522 })).toBeCloseTo(343.556, 1);
  });
  it("날짜 변경선을 지나는 가까운 두 점도 짧은 거리다", () => {
    expect(straightDistanceKm({ latitude: 0, longitude: 179.9 }, { latitude: 0, longitude: -179.9 })).toBeCloseTo(22.239, 1);
  });
  it("좌표가 없거나 잘못됐으면 거리를 꾸며내지 않는다", () => {
    expect(straightDistanceKm(null, { latitude: 0, longitude: 0 })).toBeNull();
    expect(straightDistanceKm({ latitude: 100, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeNull();
  });
  const base = { tripId: "00000000-0000-4000-8000-000000000001", fromId: "00000000-0000-4000-8000-000000000002", toId: "00000000-0000-4000-8000-000000000003", version: 0, mode: "train", minutes: "90", distanceKm: "" };
  it("비워 둔 거리와 0분을 구별하고 분 단위를 표시한다", () => {
    expect(travelInput.parse(base)).toMatchObject({ minutes: 90, distanceKm: null });
    expect(travelInput.parse({ ...base, minutes: "0" }).minutes).toBe(0);
    expect(durationLabel(90)).toBe("1시간 30분");
    expect(distanceLabel(0.125)).toBe("125m");
  });
  it("같은 일정 연결·음수·소수 분·알 수 없는 이동수단을 거절한다", () => {
    for (const change of [{ toId: base.fromId }, { minutes: "-1" }, { minutes: "1.5" }, { distanceKm: "Infinity" }, { mode: "unknown" }]) expect(travelInput.safeParse({ ...base, ...change }).success).toBe(false);
  });
});
