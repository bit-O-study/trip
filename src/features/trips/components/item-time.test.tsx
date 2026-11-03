import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ItemTime } from "./item-time";
import { itemFormSchema } from "../schema";

it("숙박은 체크인·체크아웃 날짜와 현지 시각을 표시한다", () => {
  render(<ItemTime timezone="Asia/Seoul" item={{ type: "lodging", startAt: "2026-10-05T06:00:00Z", endAt: "2026-10-07T02:00:00Z", allDay: false }} />);
  expect(screen.getByText("체크인 2026-10-05 15:00")).toBeInTheDocument();
  expect(screen.getByText("체크아웃 2026-10-07 11:00")).toBeInTheDocument();
});
it("숙박 체크아웃 생략·역전·동일 시각은 거절한다", () => {
  const input = { tripId: "00000000-0000-4000-8000-000000000001", type: "lodging", title: "호텔", startLocal: "2026-10-05T15:00" };
  for (const endLocal of ["", "2026-10-05T15:00", "2026-10-04T11:00"]) expect(itemFormSchema.safeParse({ ...input, endLocal }).success).toBe(false);
  expect(itemFormSchema.safeParse({ ...input, endLocal: "2026-10-06T11:00" }).success).toBe(true);
});
it("항공편은 여행 시간대가 아니라 각 공항 현지 시각으로 표시한다", () => {
  // 인천 09:00(00:00Z) 출발 → 호놀룰루 전날 21:00(07:00Z) 도착. 여행 시간대는 서울.
  render(
    <ItemTime
      timezone="Asia/Seoul"
      item={{
        type: "flight",
        startAt: "2026-02-14T00:00:00Z",
        endAt: "2026-02-14T07:00:00Z",
        allDay: false,
        flight: { departureAirport: "ICN", arrivalAirport: "HNL", departureTimezone: "Asia/Seoul", arrivalTimezone: "Pacific/Honolulu" },
      }}
    />,
  );
  expect(screen.getByTitle("각 공항 현지 시각")).toHaveTextContent("09:00 ICN → 02/13 21:00 HNL");
});
