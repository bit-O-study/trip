"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * 동행자 관리.
 *
 * 권한 판정은 RLS 가 한다 — `trip_members` 의 INSERT/UPDATE/DELETE 정책이
 * `is_trip_owner(trip_id)` 다. 여기서 역할을 다시 검사하면 규칙이 두 곳에
 * 생기고 반드시 어긋난다. 대신 변경된 행이 0이면 권한이 없는 것으로 본다.
 *
 * 마지막 owner 의 강등·제거는 DB 트리거(`guard_last_owner`)가 막는다. 앱이
 * 막으면 SQL 을 직접 부르는 경로에서 여행이 고아가 된다.
 */

const memberSchema = z.object({
  tripId: z.uuid(),
  userId: z.uuid(),
});

const roleSchema = memberSchema.extend({
  role: z.enum(["owner", "editor", "viewer"]),
});

function value(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw : "";
}

/** 마지막 owner 보호는 트리거가 건다. 영어 오류를 그대로 보여 주지 않는다. */
function describe(message: string): string {
  if (/last owner/i.test(message)) {
    return "마지막 소유자입니다. 다른 사람을 소유자로 지정한 뒤에 바꿀 수 있습니다.";
  }
  return message;
}

export async function updateMemberRoleAction(formData: FormData): Promise<void> {
  const parsed = roleSchema.safeParse({
    tripId: value(formData, "tripId"),
    userId: value(formData, "userId"),
    role: value(formData, "role"),
  });
  if (!parsed.success) throw new Error("올바르지 않은 요청입니다.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_members")
    .update({ role: parsed.data.role })
    .eq("trip_id", parsed.data.tripId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");

  if (error) throw new Error(`역할을 바꾸지 못했습니다: ${describe(error.message)}`);
  if (!data || data.length === 0) {
    throw new Error("역할을 바꿀 권한이 없거나 이미 나간 참여자입니다.");
  }
  revalidatePath(`/trips/${parsed.data.tripId}`);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const parsed = memberSchema.safeParse({
    tripId: value(formData, "tripId"),
    userId: value(formData, "userId"),
  });
  if (!parsed.success) throw new Error("올바르지 않은 요청입니다.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", parsed.data.tripId)
    .eq("user_id", parsed.data.userId)
    .select("user_id");

  if (error) throw new Error(`내보내지 못했습니다: ${describe(error.message)}`);
  if (!data || data.length === 0) {
    throw new Error("내보낼 권한이 없거나 이미 나간 참여자입니다.");
  }
  revalidatePath(`/trips/${parsed.data.tripId}`);
}

/**
 * 스스로 나가기.
 *
 * owner 가 아닌 멤버는 owner 를 거치지 않고 나갈 수 있어야 한다.
 * `trip_members_delete` 정책은 owner 만 허용하므로, 본인 행 삭제는 별도
 * 정책이 필요하다 (마이그레이션 20260904000002).
 */
export async function leaveTripAction(formData: FormData): Promise<void> {
  const tripId = value(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) throw new Error("올바르지 않은 여행입니다.");

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  const { data, error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", auth.user.id)
    .select("user_id");

  if (error) throw new Error(`여행에서 나가지 못했습니다: ${describe(error.message)}`);
  if (!data || data.length === 0) throw new Error("이미 나간 여행입니다.");

  revalidatePath("/");
  redirect("/");
}
