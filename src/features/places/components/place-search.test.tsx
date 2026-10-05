import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearch } from "./place-search";

vi.mock("@/features/places/actions", () => ({ addPlaceToTripAction: vi.fn() }));
const place = { provider: "kakao", providerPlaceId: "123", name: "선택한 카페", categoryGroup: "cafe", roadAddress: "서울시 테스트로", address: null, category: null, latitude: 37.5, longitude: 127, phone: null, url: null, cuisineType: null, googleRating: null, closedOnDate: null };
afterEach(() => vi.unstubAllGlobals());
async function search() {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [place], totalCount: 1, reachableCount: 1 }) }));
  fireEvent.change(screen.getByLabelText("장소 검색어"), { target: { value: "카페" } });
  fireEvent.click(screen.getByRole("button", { name: "검색" }));
  await screen.findByRole("button", { name: "선택" });
}
describe("장소 선택 단계", () => {
  it("장소 선택 다음에는 결과 목록 대신 시간 입력을 보여 주고 돌아갈 수 있다", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    render(<PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    expect(screen.queryByLabelText("장소 검색어")).not.toBeInTheDocument();
    expect(screen.getByLabelText("방문 시각")).toHaveValue("2026-10-05T09:00");
    fireEvent.click(screen.getByRole("button", { name: "장소 다시 선택" }));
    expect(screen.getByLabelText("장소 검색어")).toHaveValue("카페");
    expect(screen.getByText("선택한 카페")).toBeInTheDocument();
  });
  it("수정용 선택은 좌표를 포함한 결과를 전달하고 추가 폼을 열지 않는다", async () => {
    const select = vi.fn();
    render(<PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} onSelect={select} />);
    await search();
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    await waitFor(() => expect(select).toHaveBeenCalledWith(place));
    expect(screen.queryByLabelText("방문 시각")).not.toBeInTheDocument();
  });
});
