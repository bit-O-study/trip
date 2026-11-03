import { describe, expect, it } from "vitest";

import { pollDefaults } from "./poll-defaults";

const TZ = "Asia/Seoul";

describe("pollDefaults", () => {
  it("다른 날짜면 평소 기본값(식사 12:00, 마감 10:00)을 쓴다", () => {
    expect(pollDefaults("2026-11-10", TZ, new Date("2026-11-03T00:00:00Z"))).toEqual({
      scheduledLocal: "2026-11-10T12:00",
      closesLocal: "2026-11-10T10:00",
    });
  });

  it("오늘인데 마감까지 한 시간 넘게 남았으면 그대로 둔다", () => {
    // 서울 08:00
    expect(pollDefaults("2026-11-03", TZ, new Date("2026-11-02T23:00:00Z")).closesLocal).toBe("2026-11-03T10:00");
  });

  it("오늘이고 마감 시각이 지났다면 지금 이후로 당긴다", () => {
    // 서울 14:10 → 마감 15:30(지금+1시간을 30분 단위로 올림), 식사는 마감 90분 뒤
    expect(pollDefaults("2026-11-03", TZ, new Date("2026-11-03T05:10:00Z"))).toEqual({
      scheduledLocal: "2026-11-03T17:00",
      closesLocal: "2026-11-03T15:30",
    });
  });

  it("하루가 거의 끝났으면 기본값을 그대로 둔다(사용자가 날짜를 고른다)", () => {
    // 서울 22:30
    expect(pollDefaults("2026-11-03", TZ, new Date("2026-11-03T13:30:00Z")).closesLocal).toBe("2026-11-03T10:00");
  });
});
