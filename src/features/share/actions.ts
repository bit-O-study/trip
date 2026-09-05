"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ShareActionState } from "@/features/share/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * 공개 공유 링크 발급·회전·폐기.
 *
 * 여기서는 RLS 를 타는 보통의 클라이언트를 쓴다. `trip_share_links` 정책이
 * owner 만 쓰기를 허용하므로 권한 판정을 코드에서 되풀이하지 않는다.
 * service role 이 필요한 것은 **읽는 쪽**(로그인하지 않은 방문자)뿐이고,
 * 그 경로는 `src/features/share/server.ts` 한 곳에 격리돼 있다.
 */

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 공유 링크 기본 수명. 무기한 공개를 기본값으로 두지 않는다. */
const DEFAULT_TTL_DAYS = 30;

/**
 * 주소에 실릴 공개 식별자.
 *
 * 토큰이 아니라 "이 링크가 가리키는 여행" 을 뜻하는 값이다. 추측 가능해도
 * 쿠키 없이는 아무것도 못 보지만, 굳이 짧게 만들어 열거를 쉽게 할 이유도 없다.
 */
function newShortId(): string {
  return randomBytes(9).toString("base64url");
}

async function issue(tripId: string): Promise<ShareActionState> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "로그인이 필요합니다" };

  const token = randomBytes(32).toString("base64url");
  const { error } = await supabase.from("trip_share_links").insert({
    trip_id: tripId,
    created_by: auth.user.id,
    // 원본 토큰은 저장하지 않는다. 이 응답에서 한 번 보여 주고 끝이다.
    token_hash: tokenHash(token),
    short_id: newShortId(),
    expires_at: new Date(Date.now() + DEFAULT_TTL_DAYS * 86_400_000).toISOString(),
  });

  if (error) return { status: "error", message: `공유 링크를 만들지 못했습니다: ${error.message}` };

  revalidatePath(`/trips/${tripId}`);
  return { status: "success", sharePath: `/share/${token}` };
}

export async function createShareLinkAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  const tripId = value(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) {
    return { status: "error", message: "올바르지 않은 여행입니다" };
  }
  return issue(tripId);
}

/**
 * 회전 — 기존 링크를 전부 폐기하고 새로 발급한다.
 *
 * "링크가 어디까지 퍼졌는지 모르겠다" 는 상황의 유일한 해법이다. 폐기와
 * 발급을 따로 시키면 그 사이에 옛 링크가 살아 있는 구간이 생기고, 사용자는
 * 둘 중 하나를 빠뜨린다.
 */
export async function rotateShareLinkAction(
  _previous: ShareActionState,
  formData: FormData,
): Promise<ShareActionState> {
  const tripId = value(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) {
    return { status: "error", message: "올바르지 않은 여행입니다" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("trip_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("trip_id", tripId)
    .is("revoked_at", null);

  if (error) return { status: "error", message: `기존 링크를 폐기하지 못했습니다: ${error.message}` };
  return issue(tripId);
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  const linkId = value(formData, "linkId");
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(linkId).success) {
    throw new Error("올바르지 않은 공유 링크입니다.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("trip_id", tripId)
    .is("revoked_at", null)
    .select("id");

  if (error) throw new Error(`공유 링크를 폐기하지 못했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("공유 링크를 폐기할 권한이 없거나 이미 폐기되었습니다.");
  }
  revalidatePath(`/trips/${tripId}`);
}
