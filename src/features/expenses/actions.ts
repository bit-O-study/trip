"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { dbErrorMessage } from "@/features/trips/db-error";
import { expenseSchema } from "./model";

const request = z.object({ tripId: z.uuid(), action: z.enum(["save", "delete"]), id: z.uuid().nullable(), expected: z.string().nullable(), data: z.unknown() });
export async function manageExpense(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = request.safeParse(input);
  if (!parsed.success) return { ok: false, message: "요청 정보를 확인해 주세요." };
  const value = parsed.data;
  const data = value.action === "save" ? expenseSchema.safeParse(value.data) : null;
  if (data && !data.success) return { ok: false, message: "지출명·날짜·금액·카테고리를 확인해 주세요." };
  const client = await createSupabaseServerClient();
  const { error } = await client.rpc("manage_expense", { p_trip_id: value.tripId, p_action: value.action, p_id: value.id, p_expected: value.expected, p_data: data?.data ?? {} });
  if (error) return { ok: false, message: error.code === "40001" ? "다른 곳에서 변경되었거나 삭제된 지출입니다. 새로고침 후 다시 시도해 주세요." : dbErrorMessage("저장하지 못했습니다", error) };
  revalidatePath(`/trips/${value.tripId}/expenses`);
  return { ok: true, message: value.action === "delete" ? "지출을 삭제했습니다." : "지출을 저장했습니다." };
}
