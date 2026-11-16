import { describe, expect, it } from "vitest";
import { directionsUrl, routeDeparture, routeMode } from "./directions";
import { detailMapUrl } from "./detail-map-url";
const from = { id: "a", title: "출발", coordinate: {latitude:22.6, longitude:120.2}, locationText:null, endAt:"2026-11-20T02:00:00Z" };
const to = { ...from, id:"b", title:"도착", coordinate:{latitude:22.7,longitude:120.3} };
describe("다음 장소 길찾기", () => {
  it("상세 버튼은 직전 일정을 출발지, 선택 일정을 도착지로 넣는다", () => {
    const url = new URL(detailMapUrl(to, from, {tripId:"trip",fromId:"a",toId:"b",mode:"taxi",minutes:null,distanceKm:null,version:1,fromLocationKey:"",toLocationKey:""}));
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("origin")).toBe("22.6,120.2");
    expect(url.searchParams.get("destination")).toBe("22.7,120.3");
    expect(url.searchParams.get("travelmode")).toBe("driving");
  });
  it("좌표 없는 대만 식당은 현지 상호와 전체 주소로 찾고 임의 이동수단을 정하지 않는다", () => {
    const meal = {...to,title:"후지 오리덮밥(侯記鴨肉飯) · 점심",coordinate:null,locationText:"高雄市三民區自強一路201號"};
    const url = new URL(detailMapUrl(meal,from,undefined,"Asia/Taipei"));
    expect(url.searchParams.get("destination")).toBe("侯記鴨肉飯, 高雄市三民區自強一路201號, Taiwan");
    expect(url.searchParams.has("travelmode")).toBe(false);
    const first = new URL(detailMapUrl(meal,undefined,undefined,"Asia/Taipei"));
    expect(first.pathname).toBe("/maps/search/");
    expect(first.searchParams.has("origin")).toBe(false);
    expect(first.searchParams.get("query")).toContain("侯記鴨肉飯");
  });
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
