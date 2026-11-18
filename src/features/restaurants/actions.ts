"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrip } from "@/features/trips/queries";
import { zonedLocalToUtc } from "@/lib/datetime";
import { MEALS, regionName, restaurantSchema } from "./model";

const requestSchema = z.object({
  tripId: z.uuid(), action: z.enum(["save", "schedule", "unschedule", "delete", "candidate", "replace"]),
  id: z.uuid().nullable(), expected: z.string().nullable(), data: z.record(z.string(), z.unknown()),
});
export async function manageRestaurant(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "요청 정보를 확인하세요." };
  const { tripId, action, id, expected } = parsed.data;
  let data = parsed.data.data;
  if (action === "save") {
    const value = restaurantSchema.safeParse(data);
    if (!value.success) return { ok: false, message: "이름·지역과 입력 내용, 좌표를 확인하세요." };
    data = { ...value.data, region: regionName(value.data.region) };
  }
  if (action === "schedule") {
    const value = z.object({ local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), meal: z.enum(MEALS), itemUpdatedAt: z.string().nullable() }).safeParse(data);
    if (!value.success) return { ok: false, message: "날짜·시간과 식사 구분을 확인하세요." };
    const trip = await getTrip(tripId);
    if (!trip) return { ok: false, message: "여행을 찾을 수 없습니다." };
    try { data = { ...value.data, startAt: zonedLocalToUtc(value.data.local, trip.timezone) }; }
    catch { return { ok: false, message: "올바른 현지 시각을 입력하세요." }; }
  }
  const client = await createSupabaseServerClient();
  if (action === "candidate" || action === "replace") {
    if (!id || !expected) return { ok: false, message: "맛집을 다시 선택해 주세요." };
    let result;
    if (action === "candidate") {
      const slot = z.object({ date: z.iso.date().nullable(), meal: z.enum(MEALS).nullable() }).refine(value => (value.date === null) === (value.meal === null)).safeParse(data);
      if (!slot.success) return { ok: false, message: "대안의 날짜와 식사 구분을 확인해 주세요." };
      result = await client.rpc("set_restaurant_candidate", { p_trip_id: tripId, p_id: id, p_expected: expected, p_date: slot.data.date, p_meal: slot.data.meal });
    } else {
      const replacement = z.object({ scheduledId: z.uuid(), scheduledExpected: z.string().min(1), itemUpdatedAt: z.string().min(1) }).safeParse(data);
      if (!replacement.success) return { ok: false, message: "교체할 기존 식사 일정을 선택해 주세요." };
      result = await client.rpc("replace_restaurant_meal", { p_trip_id: tripId, p_candidate_id: id, p_candidate_expected: expected, p_scheduled_id: replacement.data.scheduledId, p_scheduled_expected: replacement.data.scheduledExpected, p_item_expected: replacement.data.itemUpdatedAt });
    }
    if (result.error) return { ok: false, message: result.error.code === "40001" ? "맛집 또는 일정이 변경되었습니다. 새로고침 후 다시 확인해 주세요." : "변경하지 못했습니다. 여행 기간과 편집 권한을 확인해 주세요." };
    revalidatePath(`/trips/${tripId}`); revalidatePath(`/trips/${tripId}/restaurants`);
    return { ok: true, message: action === "replace" ? "방문 시각을 유지해 식당을 교체했습니다. 기존 식당은 대안으로 남아 있습니다." : "식사별 대안 분류를 저장했습니다." };
  }
  const { error } = await client.rpc("manage_saved_restaurant", { p_trip_id: tripId, p_action: action, p_id: id, p_expected: expected, p_data: data });
  if (error) return { ok: false, message: error.code === "40001" ? "다른 곳에서 변경되었습니다. 새로고침 후 다시 시도하세요." : error.code === "42501" ? "편집 권한이 없습니다." : "저장하지 못했습니다. 여행 기간과 입력 내용을 확인하고 다시 시도하세요." };
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/restaurants`);
  return { ok: true, message: action === "delete" ? "보관함에서 삭제했습니다. 기존 일정은 유지됩니다." : action === "unschedule" ? "일정에서 뺐습니다. 보관함에는 남아 있습니다." : "저장했습니다." };
}
