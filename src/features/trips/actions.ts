"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { IDLE, fail, type ActionState } from "@/features/trips/action-state";
import { itemFormSchema, tripFormSchema } from "@/features/trips/schema";
import { listItems, getTrip } from "@/features/trips/queries";
import { planMoveDown, planMoveToDay, planMoveUp, type MovePlan } from "@/features/trips/reorder";
import type { ItineraryItem } from "@/features/trips/types";
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
 * 순서 이동.
 *
 * 계획(어느 시각·누구 뒤)은 `reorder.ts` 의 순수 함수가 세우고, 실제 sort_order
 * 계산과 쓰기는 `trip.move_item` 이 한 번의 원자적 호출로 처리한다.
 *
 * 계획을 서버에서 다시 세우는 이유: 화면이 오래된 상태일 수 있다. 클라이언트가
 * 계산한 "b 뒤로" 를 그대로 믿으면 그 사이 b 가 삭제되거나 다른 날로 옮겨진
 * 경우 엉뚱한 자리에 놓인다. 폼은 "무엇을 어느 방향으로" 만 보낸다.
 *
 * 버튼 기반이므로 키보드로 그대로 동작한다. 드래그가 붙어도 이 경로는
 * 접근성 대체 경로로 남는다.
 */
async function applyMove(
  tripId: string,
  itemId: string,
  plan: (items: ItineraryItem[], timezone: string) => MovePlan | null,
): Promise<void> {
  const trip = await getTrip(tripId);
  if (!trip) throw new Error("여행을 찾을 수 없습니다");

  const items = await listItems(tripId);
  const move = plan(items, trip.timezone);
  // 이미 맨 위/맨 아래거나 같은 날짜였다. 오류가 아니라 할 일이 없는 것이다.
  if (!move) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("move_item", {
    p_item_id: itemId,
    p_start_at: move.startAt,
    p_after_item_id: move.afterItemId,
  });

  if (error) throw new Error(`순서를 바꾸지 못했습니다: ${error.message}`);
  revalidatePath(`/trips/${tripId}`);
}

export async function moveItemUpAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  await applyMove(tripId, itemId, (items, timezone) => planMoveUp(items, itemId, timezone));
}

export async function moveItemDownAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  await applyMove(tripId, itemId, (items, timezone) => planMoveDown(items, itemId, timezone));
}

export async function moveItemToDayAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  const date = text(formData, "date");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  }

  await applyMove(tripId, itemId, (items, timezone) =>
    planMoveToDay(items, itemId, date, timezone),
  );
}
