import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("검색어 변경 후 도착한 이전 응답은 표시하지 않는다", async () => {
    let resolve!: (value: unknown) => void;
    const fetcher = vi.fn(() => new Promise((done) => { resolve = done; }));
    vi.stubGlobal("fetch", fetcher);
    render(<PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} />);
    fireEvent.change(screen.getByLabelText("장소 검색어"), { target: { value: "이전 검색" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.change(screen.getByLabelText("장소 검색어"), { target: { value: "새 검색" } });
    await act(async () => { resolve({ ok: true, json: async () => ({ results: [place], totalCount: 1, reachableCount: 1 }) }); });
    expect(screen.queryByText(place.name)).not.toBeInTheDocument();
  });

  it("더보기는 기존 결과를 유지하고 중복 장소를 합친다", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ results: [place], totalCount: 2, reachableCount: 2, hasMore: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [place, { ...place, providerPlaceId: "456", name: "다음 카페" }], totalCount: 2, reachableCount: 2, hasMore: false }) });
    vi.stubGlobal("fetch", fetcher);
    render(<PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} />);
    fireEvent.change(screen.getByLabelText("장소 검색어"), { target: { value: "카페" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(await screen.findByRole("button", { name: "검색 결과 더보기" }));
    await screen.findByText("다음 카페");
    expect(screen.getAllByText(place.name)).toHaveLength(1);
    expect(String(fetcher.mock.calls[1][0])).toContain("page=2");
    expect(screen.queryByRole("button", { name: "검색 결과 더보기" })).not.toBeInTheDocument();
  });

  it("취소하면 진행 중 요청을 중단하고 다시 검색할 수 있다", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, options) => { signal = options.signal; return new Promise(() => {}); }));
    const { unmount } = render(<PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} />);
    fireEvent.change(screen.getByLabelText("장소 검색어"), { target: { value: "카페" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    fireEvent.click(screen.getByRole("button", { name: "검색 취소" }));
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: "검색" })).toBeEnabled();
    unmount();
  });
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
