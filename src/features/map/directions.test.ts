import { describe, expect, it } from "vitest";
import { directionsUrl, routeDeparture, routeMode } from "./directions";
const from = { id: "a", title: "출발", coordinate: {latitude:22.6, longitude:120.2}, locationText:null, endAt:"2026-11-20T02:00:00Z" };
const to = { ...from, id:"b", title:"도착", coordinate:{latitude:22.7,longitude:120.3} };
describe("다음 장소 길찾기", () => {
  it("저장한 버스·지하철은 대중교통, 택시는 자동차로 연결한다", () => {
    expect(routeMode("bus")).toBe("TRANSIT"); expect(routeMode("subway")).toBe("TRANSIT"); expect(routeMode("taxi")).toBe("DRIVING"); expect(routeMode("walk")).toBe("WALKING");
    const url = new URL(directionsUrl(from,to,"TRANSIT"));
    expect(url.searchParams.get("origin")).toBe("22.6,120.2"); expect(url.searchParams.get("destination")).toBe("22.7,120.3"); expect(url.searchParams.get("travelmode")).toBe("transit");
  });
  it("위치가 없을 때 검색어를 안전하게 인코딩한다", () => {
    const url = new URL(directionsUrl({...from,coordinate:null,locationText:"서울역 & 출구"},to,"WALKING"));
    expect(url.searchParams.get("origin")).toBe("서울역 & 출구"); expect(url.searchParams.has("출구")).toBe(false);
  });
  it("일정 종료 시각으로 조회하고 지원 범위를 벗어난 날짜를 현재로 바꾸지 않는다", () => {
    expect(routeDeparture(from,"TRANSIT",Date.parse("2026-11-16"))?.toISOString()).toBe(from.endAt.replace("Z",".000Z"));
    expect(() => routeDeparture(from,"TRANSIT",Date.parse("2027-01-01"))).toThrow("조회할 수 없습니다");
    expect(routeDeparture({...from,allDay:true},"TRANSIT")).toBeUndefined();
  });
});