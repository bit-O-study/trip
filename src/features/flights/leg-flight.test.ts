import {expect,it} from "vitest";
import {readLegFlight} from "./leg-flight";
it("공항 시간대를 보존하고 시각은 UTC로 정규화한다",()=>{
 const input={flightNumber:"CI165",airlineName:null,departure:{airport:"ICN",timezone:"Asia/Seoul",scheduledAt:"2026-11-19T12:00:00+09:00"},arrival:{airport:"KHH",timezone:"Asia/Taipei",scheduledAt:"2026-11-19T14:00:00+08:00"}};
 expect(readLegFlight(input)?.departure.scheduledAt).toBe("2026-11-19T03:00:00.000Z");expect(readLegFlight(input)?.arrival.timezone).toBe("Asia/Taipei");
 expect(readLegFlight({...input,arrival:{...input.arrival,timezone:"invalid"}})).toBeNull();expect(readLegFlight({...input,arrival:{...input.arrival,scheduledAt:"2026-11-18T00:00:00Z"}})).toBeNull();
});