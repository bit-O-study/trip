"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/features/trips/db-error";
import { TAIWAN_TEMPLATE, packingSchema } from "./model";

const request = z.object({ tripId: z.uuid(), action: z.enum(["save", "delete", "template"]), id: z.uuid().nullable(), expected: z.string().nullable(), data: z.unknown() });
export async function managePackingItem(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = request.safeParse(input);
  if (!parsed.success) return { ok: false, message: "요청 정보를 확인해 주세요." };
  const value = parsed.data;
  const data = value.action === "save" ? packingSchema.safeParse(value.data) : null;
  if (data && !data.success) return { ok: false, message: "준비물 이름(100자 이하)과 분류(30자 이하)를 확인해 주세요." };
  const client = await createSupabaseServerClient();
  const { data: affected, error } = await client.rpc("manage_packing_item", {
    p_trip_id: value.tripId, p_action: value.action === "template" ? "add_many" : value.action, p_id: value.id, p_expected: value.expected,
    p_data: value.action === "template" ? { items: TAIWAN_TEMPLATE } : data?.data ?? {},
  });
  if (error) return { ok: false, message: error.code === "40001" ? "다른 곳에서 변경되었거나 삭제된 항목입니다. 새로고침 후 다시 시도해 주세요." : dbErrorMessage("저장하지 못했습니다", error) };
  revalidatePath(`/trips/${value.tripId}/packing`);
  if (value.action === "template") return { ok: true, message: affected ? `${affected}개 준비물을 추가했습니다.` : "이미 모든 기본 준비물이 목록에 있습니다." };
  return { ok: true, message: value.action === "delete" ? "준비물을 삭제했습니다." : "준비물을 저장했습니다." };
}
