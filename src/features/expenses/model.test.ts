import { describe, expect, it } from "vitest";
import { expenseSchema, parseAmount, totals, type Expense } from "./model";
describe("지출 금액", () => {
  it("소수 통화는 정수 최소 단위로 변환하고 과다 정밀도·음수·비정상 표기를 거부한다", () => {
    expect(parseAmount("0.29", "TWD")).toBe(29);
    expect(parseAmount("1500", "KRW")).toBe(1500);
    for (const value of ["0", "-1", "1e3", "1,000", "NaN", "0.001", "1000000000000"]) expect(parseAmount(value, "USD")).toBeNull();
    expect(parseAmount("1.5", "JPY")).toBeNull();
  });
  it("다른 통화를 합산하지 않고 날짜·카테고리를 검증한다", () => {
    const row = { title: "점심", category: "간식", spent_on: "2026-11-18", currency: "TWD", amount_minor: 29, note: "", id: "one", updated_at: "" } as Expense;
    expect(totals([row, { ...row, amount_minor: 31 }, { ...row, currency: "KRW", amount_minor: 5000 }])).toEqual([["KRW", 5000], ["TWD", 60]]);
    expect(expenseSchema.safeParse({ ...row, spent_on: "2026-02-30" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...row, category: " " }).success).toBe(false);
  });
});
