import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { TravelDirections } from "./travel-directions";
const mocks = vi.hoisted(() => ({compute:vi.fn(), load:vi.fn(), clear:vi.fn(), line:vi.fn()}));
vi.mock("./google-sdk", () => ({loadGoogleMaps:mocks.load,onMapAuthFailure:()=>()=>{}}));
const from={id:"a",title:"출발 장소",coordinate:{latitude:22.6,longitude:120.2},locationText:null};
const to={...from,id:"b",title:"다음 장소",coordinate:{latitude:22.7,longitude:120.3}};
beforeEach(()=>{
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({Map:class {fitBounds(){}},LatLngBounds:class {extend(){}}});
  vi.stubGlobal("google",{maps:{importLibrary:vi.fn().mockResolvedValue({Route:{computeRoutes:mocks.compute}}),event:{clearInstanceListeners:mocks.clear}}});
});
it("펼치기 전에는 요청하지 않고 저장한 수단과 두 좌표로 실제 경로를 요청한다",async()=>{
  const user=userEvent.setup();
  mocks.compute.mockResolvedValue({routes:[{path:[{lat:22.6,lng:120.2}],viewport:{},durationMillis:1200000,distanceMeters:1500,legs:[],createPolylines:()=>[{setMap:mocks.line}],createWaypointAdvancedMarkers:async()=>[]}]});
  render(<TravelDirections from={from} to={to} leg={{tripId:"t",fromId:"a",toId:"b",mode:"bus",minutes:20,distanceKm:null,version:1,fromLocationKey:"",toLocationKey:""}}/>);
  expect(mocks.load).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:"이동 경로 지도 보기"}));
  expect(await screen.findByText("약 20분 · 1.5km")).toBeInTheDocument();
  expect(mocks.compute).toHaveBeenCalledWith(expect.objectContaining({origin:{lat:22.6,lng:120.2},destination:{lat:22.7,lng:120.3},travelMode:"TRANSIT"}));
  await user.click(screen.getByRole("button",{name:"이동 경로 접기"}));
  expect(mocks.line).toHaveBeenLastCalledWith(null);
});
it("권한 또는 서비스 실패는 무한 로딩 대신 외부 길찾기로 연결한다",async()=>{
  mocks.compute.mockRejectedValue(Error("PERMISSION_DENIED"));
  const user=userEvent.setup();render(<TravelDirections from={from} to={to}/>);
  await user.click(screen.getByRole("button",{name:"이동 경로 지도 보기"}));
  expect(await screen.findByText("경로를 불러오지 못했습니다. Google 지도에서 확인해 주세요.")).toBeInTheDocument();
  expect(screen.queryByText("이동 경로 찾는 중…")).not.toBeInTheDocument();
  expect(screen.getByRole("link",{name:"Google 지도에서 길찾기"})).toHaveAttribute("href",expect.stringContaining("origin=22.6%2C120.2"));
});
it("좌표가 없으면 잘못된 위치를 추측해 경로를 요청하지 않는다",async()=>{
  const user=userEvent.setup();render(<TravelDirections from={{...from,coordinate:null}} to={to}/>);
  await user.click(screen.getByRole("button",{name:"이동 경로 지도 보기"}));
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("위치를 먼저 등록"));
  expect(mocks.compute).not.toHaveBeenCalled();
});