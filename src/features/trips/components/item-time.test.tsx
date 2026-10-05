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
