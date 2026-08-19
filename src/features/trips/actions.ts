"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { IDLE, fail, type ActionState } from "@/features/trips/action-state";
import { itemFormSchema, tripFormSchema } from "@/features/trips/schema";
import { getTrip } from "@/features/trips/queries";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// ---------------------------------------------------------------------------
// 여행
// ---------------------------------------------------------------------------

export async function createTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = tripFormSchema.safeParse({
    title: text(formData, "title"),
    destinationName: text(formData, "destinationName"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    timezone: text(formData, "timezone"),
    baseCurrency: text(formData, "baseCurrency"),
  });

  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("로그인이 필요합니다");

  const { data, error } = await supabase
    .from("trips")
    .insert({
      owner_id: auth.user.id,
      title: parsed.data.title,
      destination_name: parsed.data.destinationName || null,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      timezone: parsed.data.timezone,
      base_currency: parsed.data.baseCurrency,
    })
    .select("id")
    .single();

  if (error) return fail(`여행을 만들지 못했습니다: ${error.message}`);

  revalidatePath("/");
  redirect(`/trips/${data.id}`);
}

export async function updateTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = text(formData, "tripId");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");

  const parsed = tripFormSchema.safeParse({
    title: text(formData, "title"),
    destinationName: text(formData, "destinationName"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    timezone: text(formData, "timezone"),
    baseCurrency: text(formData, "baseCurrency"),
  });

  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createSupabaseServerClient();

  /*
   * 낙관적 잠금.
   *
   * 저장 전에 updated_at 을 읽어 비교하면 읽기와 쓰기 사이에 다른 트랜잭션이
   * 끼어들 수 있다. 비교를 UPDATE 조건에 넣어 원자적으로 처리하고,
   * 영향받은 행이 0이면 충돌로 본다.
   */
  const { data, error } = await supabase
    .from("trips")
    .update({
      title: parsed.data.title,
      destination_name: parsed.data.destinationName || null,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      timezone: parsed.data.timezone,
      base_currency: parsed.data.baseCurrency,
    })
    .eq("id", tripId)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id");

  if (error) return fail(`저장하지 못했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    return fail("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요");
  }

  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
  return IDLE;
}

export async function softDeleteTripAction(formData: FormData): Promise<void> {
  const tripId = text(formData, "tripId");
  const supabase = await createSupabaseServerClient();

  // 물리 삭제가 아니라 deleted_at 을 채운다. 30일 안에는 휴지통에서 복구할 수 있다.
  const { error } = await supabase
    .from("trips")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", tripId)
    .is("deleted_at", null);

  if (error) throw new Error(`삭제하지 못했습니다: ${error.message}`);

  revalidatePath("/");
  revalidatePath("/trips/trash");
  redirect("/");
}

export async function restoreTripAction(formData: FormData): Promise<void> {
  const tripId = text(formData, "tripId");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("trips")
    .update({ deleted_at: null })
    .eq("id", tripId)
    .not("deleted_at", "is", null);

  if (error) throw new Error(`복구하지 못했습니다: ${error.message}`);

  revalidatePath("/");
  revalidatePath("/trips/trash");
}

// ---------------------------------------------------------------------------
// 일정 항목
// ---------------------------------------------------------------------------

export async function createItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = itemFormSchema.safeParse({
    tripId: text(formData, "tripId"),
    type: text(formData, "type"),
    title: text(formData, "title"),
    startLocal: text(formData, "startLocal"),
    endLocal: text(formData, "endLocal"),
    locationText: text(formData, "locationText"),
    note: text(formData, "note"),
  });

  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");

  // 폼은 여행 시간대의 벽시계 시각을 받는다. 저장은 UTC 다.
  let startAt: string;
  let endAt: string | null = null;
  try {
    startAt = zonedLocalToUtc(parsed.data.startLocal, trip.timezone);
    if (parsed.data.endLocal) {
      endAt = zonedLocalToUtc(parsed.data.endLocal, trip.timezone);
    }
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다");
  }

  const supabase = await createSupabaseServerClient();

  /*
   * sort_order 는 클라이언트가 계산하지 않는다. 그 날짜의 마지막 값을 읽고
   * 더해서 쓰는 사이에 다른 사람이 같은 날짜에 항목을 넣으면 값이 겹친다.
   * DB 함수 한 번으로 끝낸다.
   */
  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: parsed.data.tripId,
    p_start_at: startAt,
  });
  if (sortError) return fail(`순서를 계산하지 못했습니다: ${sortError.message}`);

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: parsed.data.tripId,
    type: parsed.data.type,
    title: parsed.data.title,
    start_at: startAt,
    end_at: endAt,
    location_text: parsed.data.locationText || null,
    note: parsed.data.note || null,
    sort_order: sortOrder,
    source: "manual",
  });

  if (error) return fail(`일정을 추가하지 못했습니다: ${error.message}`);

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return IDLE;
}

export async function updateItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const itemId = text(formData, "itemId");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");

  const parsed = itemFormSchema.safeParse({
    tripId: text(formData, "tripId"),
    type: text(formData, "type"),
    title: text(formData, "title"),
    startLocal: text(formData, "startLocal"),
    endLocal: text(formData, "endLocal"),
    locationText: text(formData, "locationText"),
    note: text(formData, "note"),
  });

  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");

  let startAt: string;
  let endAt: string | null = null;
  try {
    startAt = zonedLocalToUtc(parsed.data.startLocal, trip.timezone);
    if (parsed.data.endLocal) {
      endAt = zonedLocalToUtc(parsed.data.endLocal, trip.timezone);
    }
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("itinerary_items")
    .update({
      type: parsed.data.type,
      title: parsed.data.title,
      start_at: startAt,
      end_at: endAt,
      location_text: parsed.data.locationText || null,
      note: parsed.data.note || null,
    })
    .eq("id", itemId)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id");

  if (error) return fail(`저장하지 못했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    return fail("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요");
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return IDLE;
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("itinerary_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .is("deleted_at", null);

  if (error) throw new Error(`일정을 삭제하지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${tripId}`);
}

/**
 * 항목을 같은 날짜 안에서 한 칸 옮긴다.
 *
 * 실제 계산은 DB 의 trip.move_item 이 원자적으로 처리한다.
 * 드래그 앤 드롭이 붙기 전까지의 키보드·버튼 경로이며, 드래그가 생겨도
 * 접근성 대체 경로로 남는다.
 */
export async function moveItemAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  const startAt = text(formData, "startAt");
  const afterItemId = text(formData, "afterItemId");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("move_item", {
    p_item_id: itemId,
    p_start_at: startAt,
    p_after_item_id: afterItemId || null,
  });

  if (error) throw new Error(`순서를 바꾸지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${tripId}`);
}
