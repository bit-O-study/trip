import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { FlightLegLookup } from "./flight-leg-lookup";
const request=vi.fn();beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",request);});
const flight={marketingFlightNumber:"CI165",airlineName:"중화항공",departure:{airport:"ICN",timezone:"Asia/Seoul",scheduledAt:"2026-11-19T03:00:00Z"},arrival:{airport:"KHH",timezone:"Asia/Taipei",scheduledAt:"2026-11-19T06:00:00Z"}};
it("편명과 출발일을 조회하고 선택한 공항·시각 정보를 전달한다",async()=>{
 request.mockResolvedValue({ok:true,json:async()=>({results:[flight]})});const select=vi.fn(),user=userEvent.setup();render(<FlightLegLookup defaultDate="2026-11-19" initialNumber="CI165" onSelect={select}/>);
 await user.click(screen.getByText("편명으로 항공편 조회"));await user.click(screen.getByRole("button",{name:"항공편 찾기"}));
 await user.click(await screen.findByRole("button",{name:"이 항공편 사용"}));
 expect(request).toHaveBeenCalledWith(expect.stringContaining("flightNumber=CI165&date=2026-11-19"),expect.anything());
 expect(select).toHaveBeenCalledWith(expect.objectContaining({flightNumber:"CI165",departure:expect.objectContaining({airport:"ICN",scheduledAt:"2026-11-19T03:00:00.000Z"})}));
});
it("공급자 설정이 없으면 직접 입력 안내를 보여준다",async()=>{
 request.mockResolvedValue({ok:false,json:async()=>({kind:"not_configured"})});const user=userEvent.setup();render(<FlightLegLookup defaultDate="2026-11-19" initialNumber="CI165" onSelect={vi.fn()}/>);
 await user.click(screen.getByText("편명으로 항공편 조회"));await user.click(screen.getByRole("button",{name:"항공편 찾기"}));
 expect(await screen.findByRole("status")).toHaveTextContent("직접 입력");expect(screen.getByRole("button",{name:"항공편 찾기"})).toBeEnabled();
});