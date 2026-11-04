import { describe, expect, it } from "vitest";

import { searchAirports } from "./airport-search";

const codes = (query: string) => searchAirports(query).map((hit) => hit.iata);

describe("searchAirports", () => {
  it("코드로 찾으면 그 공항이 맨 위", () => {
    expect(codes("tpe")[0]).toBe("TPE");
    expect(codes("NRT")[0]).toBe("NRT");
  });

  it("한국어 도시 이름으로 찾는다", () => {
    expect(codes("타이베이")).toEqual(expect.arrayContaining(["TPE", "TSA"]));
    expect(codes("도쿄")).toEqual(expect.arrayContaining(["NRT", "HND"]));
    expect(codes("오사카")).toContain("KIX");
    expect(codes("방콕")).toContain("BKK");
    expect(codes("다낭")).toContain("DAD");
  });

  it("영문 도시·공항 이름으로 찾는다", () => {
    expect(codes("Taipei")).toContain("TPE");
    expect(codes("Narita")).toContain("NRT");
    expect(codes("incheon")[0]).toBe("ICN");
  });

  it("시간대가 항상 함께 나온다", () => {
    const tpe = searchAirports("TPE")[0];
    expect(tpe.timezone).toBe("Asia/Taipei");
    expect(tpe.place).toContain("Taiwan");
  });

  it("너무 짧거나 없는 검색어는 빈 결과", () => {
    expect(searchAirports("")).toEqual([]);
    expect(searchAirports("a")).toEqual([]);
    expect(searchAirports("zzzzqqqq")).toEqual([]);
  });
});

describe("airportTimezone 내장 데이터 대체", () => {
  it("직접 고른 표에 없는 공항도 내장 데이터에서 시간대를 찾고, 모르는 코드는 null", async () => {
    const { airportTimezone } = await import("./airports");
    expect(airportTimezone("DAD")).toBe("Asia/Ho_Chi_Minh");
    expect(airportTimezone("ZZZ")).toBeNull();
  });
});
