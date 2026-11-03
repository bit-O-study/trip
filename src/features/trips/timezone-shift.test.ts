import { describe, expect, it } from "vitest";

import { planWallClockShift } from "@/features/trips/timezone-shift";
import { utcToZonedLocal } from "@/lib/datetime";

const base = { status: "confirmed", endAt: null } as const;

describe("시간대 변경 시 현지 시각 유지", () => {
  it("서울 10:00 일정은 방콕으로 바꿔도 10:00 이다", () => {
    const [update] = planWallClockShift(
      [{ ...base, id: "a", type: "activity", startAt: "2026-02-14T01:00:00Z", endAt: "2026-02-14T03:00:00Z" }],
      "Asia/Seoul",
      "Asia/Bangkok",
    );
    expect(utcToZonedLocal(update.startAt, "Asia/Bangkok")).toBe("2026-02-14T10:00");
    expect(utcToZonedLocal(update.endAt!, "Asia/Bangkok")).toBe("2026-02-14T12:00");
    expect(update.previousStartAt).toBe("2026-02-14T01:00:00Z");
  });

  it("항공편과 투표 후보는 옮기지 않는다", () => {
    expect(
      planWallClockShift(
        [
          { ...base, id: "f", type: "flight", startAt: "2026-02-14T01:00:00Z" },
          { ...base, id: "c", type: "food", status: "candidate", startAt: "2026-02-14T01:00:00Z" },
        ],
        "Asia/Seoul",
        "Asia/Bangkok",
      ),
    ).toEqual([]);
  });

  it("오프셋이 같은 시간대로 바꾸면 쓸 것이 없다", () => {
    expect(
      planWallClockShift([{ ...base, id: "a", type: "memo", startAt: "2026-02-14T01:00:00Z" }], "Asia/Seoul", "Asia/Tokyo"),
    ).toEqual([]);
  });
});
