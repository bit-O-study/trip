import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), readable: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.createClient }));
vi.mock("@/features/share/server", () => ({ isShareReadable: mocks.readable }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createShareLinkAction, rotateShareLinkAction } from "./actions";
import { SHARE_IDLE } from "./types";

describe("공유 열람 준비 전 링크 변경 차단", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readable.mockReturnValue(false);
  });

  it("열 수 없는 링크를 발급하지 않는다", async () => {
    const form = new FormData();
    form.set("tripId", "00000000-0000-4000-8000-000000000010");
    const result = await createShareLinkAction(SHARE_IDLE, form);
    expect(result.status).toBe("error");
    expect(result.sharePath).toBeUndefined();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("재발급을 요청해도 기존 링크를 폐기하지 않는다", async () => {
    const form = new FormData();
    form.set("tripId", "00000000-0000-4000-8000-000000000010");
    const result = await rotateShareLinkAction(SHARE_IDLE, form);
    expect(result.status).toBe("error");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
