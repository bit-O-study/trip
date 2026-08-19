import { describe, expect, it } from "vitest";

import {
  tripDayCount,
  tripDays,
  tripDurationLabel,
  zonedDateKey,
  zonedLocalToUtc,
  zonedTimeLabel,
  utcToZonedLocal,
} from "@/lib/datetime";

describe("zonedDateKey", () => {
  it("여행 시간대 기준으로 날짜를 가른다", () => {
    // UTC 로는 14일이지만 도쿄에서는 15일 01:00 이다.
    // DB 의 trip_private.item_day() 와 같은 결과여야 한다.
    expect(zonedDateKey("2026-02-14T16:00:00Z", "Asia/Tokyo")).toBe("2026-02-15");
    expect(zonedDateKey("2026-02-14T16:00:00Z", "UTC")).toBe("2026-02-14");
  });

  it("서쪽 시간대에서는 반대로 밀린다", () => {
    // UTC 로는 15일 02:00 이지만 로스앤젤레스에서는 14일 18:00 이다.
    expect(zonedDateKey("2026-02-15T02:00:00Z", "America/Los_Angeles")).toBe("2026-02-14");
  });

  it("올바르지 않은 시각은 거부한다", () => {
    expect(() => zonedDateKey("not-a-date", "Asia/Seoul")).toThrow(/올바르지 않은 시각/);
  });
});

describe("zonedTimeLabel", () => {
  it("24시간 표기로 시각을 만든다", () => {
    expect(zonedTimeLabel("2026-02-14T23:20:00Z", "Asia/Tokyo")).toBe("08:20");
    expect(zonedTimeLabel("2026-02-14T00:05:00Z", "UTC")).toBe("00:05");
  });

  it("자정을 24시로 표기하지 않는다", () => {
    expect(zonedTimeLabel("2026-02-14T15:00:00Z", "Asia/Tokyo")).toBe("00:00");
  });
});

describe("zonedLocalToUtc", () => {
  it("여행 시간대의 벽시계 시각을 UTC 로 바꾼다", () => {
    // 도쿄 08:20 = UTC 전날 23:20
    expect(zonedLocalToUtc("2026-02-14T08:20", "Asia/Tokyo")).toBe("2026-02-13T23:20:00.000Z");
    expect(zonedLocalToUtc("2026-02-14T08:20", "UTC")).toBe("2026-02-14T08:20:00.000Z");
  });

  it("음수 오프셋 시간대도 처리한다", () => {
    // LA 는 2월에 UTC-8
    expect(zonedLocalToUtc("2026-02-14T10:00", "America/Los_Angeles")).toBe(
      "2026-02-14T18:00:00.000Z",
    );
  });

  it("DST 전환일에도 한 시간 어긋나지 않는다", () => {
    // 2026-03-08 은 미국 서머타임 시작일(02:00 → 03:00).
    // 전환 전은 UTC-8, 후는 UTC-7 이다.
    expect(zonedLocalToUtc("2026-03-08T01:30", "America/Los_Angeles")).toBe(
      "2026-03-08T09:30:00.000Z",
    );
    expect(zonedLocalToUtc("2026-03-08T12:00", "America/Los_Angeles")).toBe(
      "2026-03-08T19:00:00.000Z",
    );
  });

  it("왕복 변환이 값을 보존한다", () => {
    for (const zone of ["Asia/Seoul", "Asia/Tokyo", "Europe/Paris", "America/Los_Angeles"]) {
      for (const local of ["2026-02-14T08:20", "2026-07-01T23:59", "2026-11-01T00:00"]) {
        expect(utcToZonedLocal(zonedLocalToUtc(local, zone), zone)).toBe(local);
      }
    }
  });

  it("형식이 다르면 거부한다", () => {
    expect(() => zonedLocalToUtc("2026-02-14 08:20", "Asia/Seoul")).toThrow(/형식/);
  });
});

describe("tripDays", () => {
  it("시작일과 종료일을 포함해 편다", () => {
    const days = tripDays("2026-02-14", "2026-02-18");

    expect(days).toHaveLength(5);
    expect(days[0]).toEqual({
      index: 0,
      date: "2026-02-14",
      weekday: "토",
      shortLabel: "2/14",
    });
    expect(days[4].date).toBe("2026-02-18");
  });

  it("당일치기는 하루만 만든다", () => {
    expect(tripDays("2026-02-14", "2026-02-14")).toHaveLength(1);
  });

  it("월과 해를 넘어간다", () => {
    const days = tripDays("2026-12-30", "2027-01-02");
    expect(days.map((day) => day.date)).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("윤년 2월 29일을 건너뛰지 않는다", () => {
    const days = tripDays("2028-02-28", "2028-03-01");
    expect(days.map((day) => day.date)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("종료일이 시작일보다 이르면 빈 목록을 준다", () => {
    // 잘못 저장된 여행 하나가 목록 화면 전체를 깨뜨리면 안 된다.
    expect(tripDays("2026-02-18", "2026-02-14")).toEqual([]);
  });

  it("형식이 다르면 거부한다", () => {
    expect(() => tripDays("2026-2-14", "2026-02-18")).toThrow(/날짜 형식/);
    expect(() => tripDays("", "")).toThrow(/날짜 형식/);
  });

  it("DST 전환이 있는 구간에서도 날짜가 밀리지 않는다", () => {
    // date 컬럼은 시간대가 없으므로 순수 날짜 산술이어야 한다.
    // UTC 가 아닌 기준으로 계산하면 DST 경계에서 하루가 사라지거나 겹친다.
    const days = tripDays("2026-03-07", "2026-03-10");
    expect(days.map((day) => day.date)).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
  });
});

describe("tripDayCount / tripDurationLabel", () => {
  it("일수를 센다", () => {
    expect(tripDayCount("2026-02-14", "2026-02-18")).toBe(5);
  });

  it("숙박 수로 라벨을 만든다", () => {
    expect(tripDurationLabel("2026-02-14", "2026-02-18")).toBe("4박5일");
    expect(tripDurationLabel("2026-02-14", "2026-02-15")).toBe("1박2일");
    expect(tripDurationLabel("2026-02-14", "2026-02-14")).toBe("당일");
  });

  it("잘못된 기간은 빈 문자열", () => {
    expect(tripDurationLabel("2026-02-18", "2026-02-14")).toBe("");
  });
});
