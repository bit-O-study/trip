import { describe, expect, it } from "vitest";

import { dbErrorMessage, dbErrorReason } from "@/features/trips/db-error";

describe("PostgREST 오류 한국어 변환", () => {
  it("제약 이름을 보고 원인을 알려 준다", () => {
    expect(
      dbErrorReason({
        code: "23514",
        message: 'new row for relation "itinerary_items" violates check constraint "itinerary_items_time_range"',
      }),
    ).toBe("종료 시각은 시작 시각 이후여야 합니다.");
  });

  it("코드별로 한국어 문장을 고른다", () => {
    expect(dbErrorReason({ code: "42501", message: "new row violates row-level security policy" })).toBe("권한이 없습니다.");
    expect(dbErrorReason({ code: "23505", message: "duplicate key value" })).toBe("이미 같은 항목이 있습니다.");
  });

  it("영어 원문을 그대로 노출하지 않는다", () => {
    const message = dbErrorMessage("일정을 추가하지 못했습니다", { code: "XX000", message: "internal error: something" });
    expect(message).toBe("일정을 추가하지 못했습니다. 잠시 후 다시 시도하세요.");
    expect(message).not.toMatch(/internal|something/);
  });

  it("네트워크 오류를 구분한다", () => {
    expect(dbErrorReason({ message: "TypeError: fetch failed" })).toMatch(/연결하지 못했습니다/);
  });
});
