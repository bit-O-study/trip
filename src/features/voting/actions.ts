"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { InviteActionState } from "@/features/voting/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function toggleRestaurantVoteAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  const itemId = value(formData, "itemId");
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
    : await supabase
        .from("restaurant_votes")
        .upsert({ item_id: itemId, user_id: auth.user.id }, { onConflict: "item_id,user_id" });

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
    .eq("type", "food")
    .eq("status", "candidate");
  if (error) throw new Error(`후보를 확정하지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${tripId}`);
}

export async function createVoteInviteAction(
  _previous: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const tripId = value(formData, "tripId");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "로그인이 필요합니다" };

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("trip_invites").insert({
    trip_id: tripId,
    created_by: auth.user.id,
    token_hash: tokenHash(token),
    role: "viewer",
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
