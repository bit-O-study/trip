import { describe, expect, it } from "vitest";

import { IDLE, fail, submittedValues, valueOr, withSubmittedValues } from "@/features/trips/action-state";

describe("검증 실패 시 제출 값 보존", () => {
  it("실패 결과에 제출한 문자열 값을 붙인다", () => {
    const form = new FormData();
    form.set("title", "도쿄");
    form.set("$ACTION_ID_abc", "");
    form.set("file", new Blob(["x"]));
    const state = withSubmittedValues(fail("입력을 확인하세요"), form);
    expect(state.values).toEqual({ title: "도쿄" });
    expect(submittedValues(form)).toEqual({ title: "도쿄" });
  });

  it("성공하면 값을 붙이지 않아 폼이 비워진다", () => {
    const form = new FormData();
    form.set("title", "도쿄");
    expect(withSubmittedValues({ status: "success" }, form).values).toBeUndefined();
  });

  it("실패했을 때만 기본값을 제출 값으로 바꾼다", () => {
    const failed = fail("x", undefined, { title: "새 제목", note: "" });
    expect(valueOr(failed, "title", "원래")).toBe("새 제목");
    expect(valueOr(failed, "note", "원래")).toBe("");
    expect(valueOr(failed, "missing", "원래")).toBe("원래");
    expect(valueOr(IDLE, "title", "원래")).toBe("원래");
  });
});
