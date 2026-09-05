"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fail, type ActionState } from "@/features/trips/action-state";
import type { InviteActionState } from "@/features/voting/types";
import { getTrip } from "@/features/trips/queries";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const createPollSchema = z.object({
  tripId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().min(1).max(120),
  scheduledLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  closesLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

export async function createRestaurantPollAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createPollSchema.safeParse({
    tripId: value(formData, "tripId"),
    title: value(formData, "title"),
    location: value(formData, "location"),
    scheduledLocal: value(formData, "scheduledLocal"),
    closesLocal: value(formData, "closesLocal"),
  });
  if (!parsed.success) return fail("투표 제목과 일정·종료 시각을 확인하세요.");
  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다.");
  const scheduledAt = zonedLocalToUtc(parsed.data.scheduledLocal, trip.timezone);
  const closesAt = zonedLocalToUtc(parsed.data.closesLocal, trip.timezone);
  if (new Date(closesAt) >= new Date(scheduledAt)) {
    return fail("투표 종료 시각은 식사 일정 시각보다 빨라야 합니다.", {
      closesLocal: ["식사 일정 시각보다 빨라야 합니다"],
    });
  }
  /*
   * 종료 시각이 이미 지났으면 만들자마자 끝난 투표가 된다.
   *
   * `finalize_due_restaurant_polls()` 는 매분(그리고 화면을 열 때마다) 돌면서
   * `closes_at <= now()` 인 투표를 확정한다. 그래서 지난 시각으로 만들면 후보를
   * 넣기도 전에 "투표 종료 · 후보 없음" 이 된다. 폼 기본값이 여행 첫날 10:00
   * 이라 지난 여행에서는 이게 기본 동작이었다.
   */
  if (new Date(closesAt) <= new Date()) {
    return fail("투표 종료 시각이 이미 지났습니다. 앞으로의 시각을 골라 주세요.", {
      closesLocal: ["이미 지난 시각입니다"],
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("로그인이 필요합니다.");
  const { data, error } = await supabase.from("restaurant_polls").insert({
    trip_id: parsed.data.tripId,
    title: parsed.data.title,
    scheduled_at: scheduledAt,
    closes_at: closesAt,
    created_by: auth.user.id,
  }).select("id").single();
  if (error) return fail(`투표를 만들지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${parsed.data.tripId}`);
  const params = new URLSearchParams({ q: parsed.data.location });
  redirect(`/trips/${parsed.data.tripId}/polls/${data.id}?${params}`);
}

export async function deleteRestaurantPollAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  const pollId = value(formData, "pollId");
  const returnTo = value(formData, "returnTo");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  const removed = await supabase.rpc("delete_own_restaurant_poll", { p_poll_id: pollId });
  if (removed.error) throw new Error(`투표를 삭제하지 못했습니다: ${removed.error.message}`);
  if (removed.data !== true) throw new Error("투표를 만든 사람만 삭제할 수 있습니다.");
  revalidatePath(`/trips/${tripId}`);
  if (returnTo === `/trips/${tripId}`) redirect(returnTo);
}

export async function toggleRestaurantVoteAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  const itemId = value(formData, "itemId");
  const pollId = value(formData, "pollId");
  const remove = value(formData, "remove") === "true";
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다");

  const result = remove
    ? await supabase
        .from("restaurant_votes")
        .delete()
        .eq("item_id", itemId)
        .eq("user_id", auth.user.id)
    : await (async () => {
        const removed = await supabase
          .from("restaurant_votes")
          .delete()
          .eq("poll_id", pollId)
          .eq("user_id", auth.user.id);
        if (removed.error) return removed;
        return supabase.from("restaurant_votes").insert({
          poll_id: pollId,
          item_id: itemId,
          user_id: auth.user.id,
        });
      })();

  if (result.error) throw new Error(`투표를 반영하지 못했습니다: ${result.error.message}`);
  revalidatePath(`/trips/${tripId}`);
}

export async function confirmRestaurantCandidateAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  const itemId = value(formData, "itemId");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("itinerary_items")
    .update({ status: "confirmed" })
    .eq("id", itemId)
    .eq("trip_id", tripId)
    .eq("status", "candidate");
  if (error) throw new Error(`후보를 확정하지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${tripId}`);
}

/**
 * 참여 초대 링크.
 *
 * 역할을 고를 수 있어야 한다. viewer 로 고정돼 있던 동안에는 초대받은 사람이
 * 일정도 못 고치고 투표 후보도 못 넣어, 함께 계획을 세우자고 부른 사람이
 * 구경만 하는 상태가 됐다. owner 는 초대로 만들지 않는다 — 소유권 이전은
 * 참여자 목록에서 명시적으로 한다.
 */
export async function createVoteInviteAction(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const tripId = value(formData, "tripId");
  const parsedRole = z.enum(["editor", "viewer"]).safeParse(value(formData, "role"));
  if (!parsedRole.success) return { status: "error", message: "역할을 선택하세요" };

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "로그인이 필요합니다" };

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("trip_invites").insert({
    trip_id: tripId,
    created_by: auth.user.id,
    token_hash: tokenHash(token),
    role: parsedRole.data,
    max_uses: 20,
    expires_at: expiresAt,
  });
  if (error) return { status: "error", message: `초대 링크를 만들지 못했습니다: ${error.message}` };

  return { status: "success", invitePath: `/invite/${token}` };
}

export async function acceptVoteInviteAction(formData: FormData): Promise<void> {
  const token = value(formData, "token");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_invite", {
    p_token_hash: tokenHash(token),
  });
  if (error || typeof data !== "string") {
    throw new Error("초대 링크가 만료됐거나 사용할 수 없습니다");
  }
  revalidatePath(`/trips/${data}`);
  redirect(`/trips/${data}`);
}
