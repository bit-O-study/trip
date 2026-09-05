import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shareInvite } from "./share-invite";

const share = vi.fn();
const writeText = vi.fn();

describe("shareInvite", () => {
  beforeEach(() => {
    share.mockReset().mockResolvedValue(undefined);
    writeText.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("공유 시트에 현재 Trip 사이트의 초대 URL만 전달한다", async () => {
    await expect(shareInvite("/invite/test-token", "용리단길")).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({
      title: "용리단길 · Trip Planner",
      text: expect.stringContaining("용리단길"),
      url: `${window.location.origin}/invite/test-token`,
    });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("공유 시트가 없으면 상대가 열 수 있는 절대 URL을 복사한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(shareInvite("/invite/test-token", "여행")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/test-token`);
  });

  it("사용자가 공유를 취소하면 클립보드를 덮어쓰지 않는다", async () => {
    share.mockRejectedValue(new DOMException("cancelled", "AbortError"));
    await expect(shareInvite("/invite/test-token", "여행")).resolves.toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("공유 권한이 차단돼도 링크 복사로 전달할 수 있다", async () => {
    share.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    await expect(shareInvite("/invite/test-token", "여행")).resolves.toBe("copied");
  });

  it("다른 앱 주소나 초대가 아닌 경로는 공유하지 않는다", async () => {
    for (const path of ["https://other.example/invite/token", "//other.example/invite/token", "/trips/new"]) {
      await expect(shareInvite(path, "여행")).rejects.toThrow("올바르지 않은 초대 링크");
    }
    expect(share).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("공유와 복사가 모두 실패하면 수동 복사 방법을 안내한다", async () => {
    share.mockRejectedValue(new Error("blocked"));
    writeText.mockRejectedValue(new Error("blocked"));
    await expect(shareInvite("/invite/test-token", "여행")).rejects.toThrow("직접 복사");
  });
});
