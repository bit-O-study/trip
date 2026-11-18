import { describe, expect, it } from "vitest";
import { PACKING_CATEGORIES, TAIWAN_TEMPLATE, groupByCategory, packingSchema, progress, type PackingItem } from "./model";

const item = (title: string, category: string, checked = false): PackingItem => ({ id: title, title, category, checked, updated_at: "2026-11-18T00:00:00Z" });

describe("준비물 모델", () => {
  it("진행률을 계산하고 빈 목록은 0%다", () => {
    expect(progress([])).toEqual({ done: 0, total: 0, percent: 0 });
    expect(progress([item("a", "기타", true), item("b", "기타"), item("c", "기타")])).toEqual({ done: 1, total: 3, percent: 33 });
  });
  it("기본 분류를 앞에, 직접 만든 분류를 뒤에 묶는다", () => {
    const groups = groupByCategory([item("a", "아기용품"), item("b", "의류"), item("c", "서류·결제")]);
    expect(groups.map(([name]) => name)).toEqual(["서류·결제", "의류", "아기용품"]);
  });
  it("입력을 검증한다", () => {
    expect(packingSchema.safeParse({ title: " 여권 ", category: "서류·결제", checked: false }).success).toBe(true);
    expect(packingSchema.safeParse({ title: " ", category: "기타", checked: false }).success).toBe(false);
    expect(packingSchema.safeParse({ title: "x".repeat(101), category: "기타", checked: false }).success).toBe(false);
  });
  it("대만 기본 목록은 허용 길이 안이고 중복이 없으며 기본 분류만 쓴다", () => {
    const keys = TAIWAN_TEMPLATE.map(t => `${t.category}/${t.title}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(TAIWAN_TEMPLATE.every(t => t.title.length <= 100 && PACKING_CATEGORIES.includes(t.category))).toBe(true);
  });
});
