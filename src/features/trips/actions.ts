"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { selectedPlaceSchema } from "@/features/places/schema";

import { fail, withSubmittedValues, type ActionState } from "@/features/trips/action-state";
import { dbErrorMessage } from "@/features/trips/db-error";
import { PlaceSearchError, searchPlaces } from "@/features/places/kakao";
import { itemFormSchema, tripFormSchema } from "@/features/trips/schema";
import { listItems, getTrip } from "@/features/trips/queries";
import {
  isNoopMove,
  planMoveAfter,
  planMoveBefore,
  planMoveDown,
  planMoveToDay,
  planMoveUp,
  planRestore,
  type MovePlan,
  type MoveResult,
} from "@/features/trips/reorder";
import { planWallClockShift, type ShiftableItem } from "@/features/trips/timezone-shift";
import type { ItineraryItem } from "@/features/trips/types";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

const DELETED_TRIP = "휴지통에 있는 여행입니다. 복구한 뒤 수정하세요.";

/**
 * Kakao 로컬 검색은 국내 장소만 안다. 해외 여행에서 "신주쿠 3초메" 를 넣으면
 * 이름이 비슷한 국내 장소의 좌표가 붙어 지도·거리 계산이 통째로 틀어졌다.
 * 그래서 자동 좌표는 국내(Asia/Seoul) 여행에서만 붙인다.
 */
function canAutoGeocode(timezone: string): boolean {
  return timezone === "Asia/Seoul";
}

/**
 * 직접 입력한 장소 문자열에 좌표를 붙여 본다.
 *
 * **실패해도 저장을 막지 않는다.** 좌표는 지도에 점을 찍기 위한 덤이고, 일정
 * 자체는 "공항 3층 만남의 광장" 처럼 지도에 없는 곳으로도 만들 수 있어야 한다.
 * 검색이 막혔다고 일정 추가 경로까지 함께 죽으면 degraded mode 가 아니라
 * 그냥 장애다 (docs/architecture.md §1 의 외부 API 장애 정책).
 *
 * 붙인 좌표는 사용자가 고른 것이 아니라 첫 검색 결과다. `estimated: true` 로
 * 남겨 화면이 "추정 위치" 로 표시하게 한다.
 *
 * 결과가 없거나 검색이 실패하면 null 을 돌려주고, 항목은 글자로만 남는다.
 */
async function lookupSnapshot(
  locationText: string | undefined,
  timezone: string,
): Promise<Record<string, unknown> | null> {
  if (!locationText || !canAutoGeocode(timezone)) return null;
  try {
    const found = await searchPlaces({ query: locationText });
    const place = found.results[0];
    return place ? { ...place, estimated: true, capturedAt: new Date().toISOString() } : null;
  } catch (error) {
    if (error instanceof PlaceSearchError) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 여행
// ---------------------------------------------------------------------------

function parseTripForm(formData: FormData) {
  return tripFormSchema.safeParse({
    title: text(formData, "title"),
    destinationName: text(formData, "destinationName"),
    startDate: text(formData, "startDate"),
    endDate: text(formData, "endDate"),
    timezone: text(formData, "timezone"),
    baseCurrency: text(formData, "baseCurrency"),
  });
}

export async function createTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSubmittedValues(await createTrip(formData), formData);
}

async function createTrip(formData: FormData): Promise<ActionState> {
  const parsed = parseTripForm(formData);
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

  if (error) return fail(dbErrorMessage("여행을 만들지 못했습니다", error));

  revalidatePath("/");
  redirect(`/trips/${data.id}`);
}

export async function updateTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSubmittedValues(await updateTrip(formData), formData);
}

async function updateTrip(formData: FormData): Promise<ActionState> {
  const tripId = text(formData, "tripId");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");
  const timezoneMode = text(formData, "timezoneMode");

  const parsed = parseTripForm(formData);
  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }
  if (!z.uuid().safeParse(tripId).success) return fail("올바르지 않은 여행입니다");

  const current = await getTrip(tripId);
  if (!current) return fail("여행을 찾을 수 없습니다");
  if (current.deletedAt) return fail(DELETED_TRIP);

  /*
   * 시간대를 바꾸면 저장된 UTC 는 그대로라 **모든 일정의 표시 시각이 바뀐다.**
   * (서울 10:00 → 도쿄로 바꾸면 10:00, 방콕으로 바꾸면 08:00.) 사용자가 무엇을
   * 원하는지 묻지 않고 조용히 바꾸면 안 되므로, 어느 쪽인지 명시해야 저장한다.
   */
  const timezoneChanged = parsed.data.timezone !== current.timezone;
  if (timezoneChanged && timezoneMode !== "wall_clock" && timezoneMode !== "instant") {
    return fail("시간대를 바꾸면 기존 일정 시각을 어떻게 할지 선택하세요", {
      timezoneMode: ["기존 일정의 현지 시각을 유지할지, 실제 시각을 유지할지 고르세요"],
    });
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

  if (error) return fail(dbErrorMessage("저장하지 못했습니다", error));
  if (!data || data.length === 0) {
    return fail("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요");
  }

  let message = "여행 정보를 저장했습니다.";
  if (timezoneChanged && timezoneMode === "wall_clock") {
    const shifted = await shiftItemsToWallClock(supabase, tripId, current.timezone, parsed.data.timezone);
    message = shifted.failed > 0
      ? `여행 정보를 저장했습니다. 일정 ${shifted.updated}개의 현지 시각을 유지했지만 ${shifted.failed}개는 옮기지 못했습니다. 해당 일정의 시각을 확인하세요.`
      : `여행 정보를 저장했습니다. 일정 ${shifted.updated}개의 현지 시각을 그대로 유지했습니다.`;
  }

  revalidatePath("/");
  revalidatePath(`/trips/${tripId}`);
  /*
   * 성공을 명시적으로 알린다. IDLE 로 돌려주면 화면이 아무 반응도 하지 않아
   * 저장이 됐는지 알 수 없다. 재검증으로 폼의 expectedUpdatedAt 도 새 값으로
   * 갈아 끼워지므로 연달아 저장해도 충돌로 잡히지 않는다.
   */
  return { status: "success", message };
}

/**
 * 시간대 변경 후 일정의 벽시계 시각을 유지한다.
 *
 * 항공편은 공항 시간대로 저장된 실제 시각이라 옮기지 않는다. 투표 후보는 투표
 * 일정(restaurant_polls.scheduled_at)과 짝이라 함께 두고, 확정된 일정만 옮긴다.
 *
 * 한 트랜잭션이 아니다 — PostgREST 에는 행마다 다른 값의 일괄 UPDATE 가 없다.
 * 행마다 원래 start_at 을 조건으로 걸어 그 사이 다른 사람이 고친 일정은 덮어쓰지
 * 않고, 실패 개수를 돌려줘 화면이 알리게 한다. (원자성이 필요하면 RPC 로 옮길 것.)
 */
async function shiftItemsToWallClock(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tripId: string,
  fromTimezone: string,
  toTimezone: string,
): Promise<{ updated: number; failed: number }> {
  const { data, error } = await supabase
    .from("itinerary_items")
    .select("id, type, status, start_at, end_at")
    .eq("trip_id", tripId)
    .is("deleted_at", null);
  if (error) return { updated: 0, failed: 1 };

  const updates = planWallClockShift(
    (data ?? []).map(
      (row): ShiftableItem => ({
        id: row.id,
        type: row.type,
        status: row.status,
        startAt: row.start_at,
        endAt: row.end_at,
      }),
    ),
    fromTimezone,
    toTimezone,
  );

  let updated = 0;
  let failed = 0;
  const BATCH = 20;
  for (let index = 0; index < updates.length; index += BATCH) {
    const results = await Promise.all(
      updates.slice(index, index + BATCH).map((update) =>
        supabase
          .from("itinerary_items")
          .update({ start_at: update.startAt, end_at: update.endAt })
          .eq("id", update.id)
          .eq("trip_id", tripId)
          .eq("start_at", update.previousStartAt)
          .is("deleted_at", null)
          .select("id"),
      ),
    );
    for (const result of results) {
      if (!result.error && result.data?.length) updated += 1;
      else failed += 1;
    }
  }
  return { updated, failed };
}

async function softDeleteTrip(formData: FormData): Promise<void> {
  const tripId = text(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) throw new Error("올바르지 않은 여행입니다.");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  // 물리 삭제가 아니라 deleted_at 을 채운다. 30일 안에는 휴지통에서 복구할 수 있다.
  const { data, error } = await supabase
    .from("trips")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", tripId)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(dbErrorMessage("삭제하지 못했습니다", error));
  if (!data || data.length === 0) throw new Error("여행을 삭제할 권한이 없거나 이미 삭제되었습니다.");

  revalidatePath("/");
  revalidatePath("/trips/trash");
}

export async function softDeleteTripAction(formData: FormData): Promise<void> {
  await softDeleteTrip(formData);
  // 삭제 직후 목록에서 "휴지통으로 옮겼습니다" 안내를 보여 주기 위한 표시.
  redirect("/?trashed=1");
}

/** 화면용. 실패해도 던지지 않고 이유를 돌려준다(운영 빌드에서는 던진 메시지가 가려진다). */
export async function softDeleteTripFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await softDeleteTrip(formData);
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "삭제하지 못했습니다.");
  }
  redirect("/?trashed=1");
}

export async function restoreTripFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const tripId = text(formData, "tripId");
  try {
    await restoreTripAction(formData);
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "복구하지 못했습니다.");
  }
  // 복구한 여행을 바로 열 수 있게 휴지통에 안내를 붙인다.
  redirect(`/trips/trash?restored=${encodeURIComponent(tripId)}`);
}

export async function restoreTripAction(formData: FormData): Promise<void> {
  const tripId = text(formData, "tripId");
  if (!z.uuid().safeParse(tripId).success) throw new Error("올바르지 않은 여행입니다.");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  /*
   * 삭제와 같은 방식으로 영향받은 행을 확인한다.
   *
   * 확인하지 않으면 RLS 가 막았을 때(편집 권한이 없는 참여자)에도 오류가 없다.
   * 화면은 재검증으로 새로 그려지고 여행은 휴지통에 그대로 남으므로, 사용자는
   * "복구를 눌렀는데 아무 일도 일어나지 않는" 상태를 반복하게 된다.
   */
  const { data, error } = await supabase
    .from("trips")
    .update({ deleted_at: null })
    .eq("id", tripId)
    .not("deleted_at", "is", null)
    .select("id");

  if (error) throw new Error(dbErrorMessage("복구하지 못했습니다", error));
  if (!data || data.length === 0) {
    throw new Error("여행을 복구할 권한이 없거나 이미 복구되었습니다.");
  }

  revalidatePath("/");
  revalidatePath("/trips/trash");
  revalidatePath(`/trips/${tripId}`);
}

// ---------------------------------------------------------------------------
// 일정 항목
// ---------------------------------------------------------------------------

function parseItemForm(formData: FormData) {
  return itemFormSchema.safeParse({
    tripId: text(formData, "tripId"),
    type: text(formData, "type"),
    title: text(formData, "title"),
    startLocal: text(formData, "startLocal"),
    endLocal: text(formData, "endLocal"),
    locationText: text(formData, "locationText"),
    note: text(formData, "note"),
  });
}

/** 폼의 벽시계 입력을 UTC 로. 실패하면 사용자에게 보여 줄 문장을 준다. */
function toUtcRange(
  startLocal: string,
  endLocal: string | undefined,
  timezone: string,
): { startAt: string; endAt: string | null } | { error: string } {
  try {
    return {
      startAt: zonedLocalToUtc(startLocal, timezone),
      endAt: endLocal ? zonedLocalToUtc(endLocal, timezone) : null,
    };
  } catch (caught) {
    return { error: caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다" };
  }
}

export async function createItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSubmittedValues(await createItem(formData), formData);
}

async function createItem(formData: FormData): Promise<ActionState> {
  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");
  if (trip.deletedAt) return fail(DELETED_TRIP);

  // 폼은 여행 시간대의 벽시계 시각을 받는다. 저장은 UTC 다.
  const range = toUtcRange(parsed.data.startLocal, parsed.data.endLocal, trip.timezone);
  if ("error" in range) return fail(range.error);

  const supabase = await createSupabaseServerClient();

  /*
   * sort_order 는 클라이언트가 계산하지 않는다. 그 날짜의 마지막 값을 읽고
   * 더해서 쓰는 사이에 다른 사람이 같은 날짜에 항목을 넣으면 값이 겹친다.
   * DB 함수 한 번으로 끝낸다.
   */
  const placeSnapshot = await lookupSnapshot(parsed.data.locationText, trip.timezone);

  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: parsed.data.tripId,
    p_start_at: range.startAt,
  });
  if (sortError) return fail(dbErrorMessage("순서를 계산하지 못했습니다", sortError));

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: parsed.data.tripId,
    type: parsed.data.type,
    title: parsed.data.title,
    start_at: range.startAt,
    end_at: range.endAt,
    location_text: parsed.data.locationText || null,
    place_snapshot: placeSnapshot,
    note: parsed.data.note || null,
    sort_order: sortOrder,
    source: "manual",
  });

  if (error) return fail(dbErrorMessage("일정을 추가하지 못했습니다", error));

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { status: "success", message: "일정을 추가했습니다." };
}

export async function updateItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return withSubmittedValues(await updateItem(formData), formData);
}

async function updateItem(formData: FormData): Promise<ActionState> {
  const itemId = text(formData, "itemId");
  const expectedUpdatedAt = text(formData, "expectedUpdatedAt");

  const parsed = parseItemForm(formData);
  if (!parsed.success) {
    return fail("입력을 확인하세요", parsed.error.flatten().fieldErrors);
  }

  const trip = await getTrip(parsed.data.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");
  if (trip.deletedAt) return fail(DELETED_TRIP);

  const range = toUtcRange(parsed.data.startLocal, parsed.data.endLocal, trip.timezone);
  if ("error" in range) return fail(range.error);

  const supabase = await createSupabaseServerClient();
  const current = await supabase
    .from("itinerary_items")
    .select("location_text, place_snapshot")
    .eq("id", itemId)
    .eq("trip_id", parsed.data.tripId)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .maybeSingle();
  if (current.error) return fail(dbErrorMessage("일정을 불러오지 못했습니다", current.error));
  if (!current.data) return conflictState(supabase, itemId, parsed.data.tripId);

  const nextLocation = parsed.data.locationText || null;
  let nextSnapshot = current.data.place_snapshot;
  let clearPlaceId = false;
  const selectedPlace = text(formData, "selectedPlace");
  if (selectedPlace) {
    let payload: unknown;
    try { payload = JSON.parse(selectedPlace); } catch { return fail("선택한 장소가 올바르지 않습니다."); }
    const place = selectedPlaceSchema.safeParse(payload);
    if (!place.success) return fail("선택한 장소가 올바르지 않습니다.");
    // 사용자가 검색 결과에서 직접 고른 좌표다. 추정이 아니다.
    nextSnapshot = { ...place.data, selected: true, capturedAt: new Date().toISOString() };
    clearPlaceId = true;
  } else if (nextLocation !== current.data.location_text) {
    // 장소 문자열이 바뀌면 옛 스냅샷은 더 이상 이 항목의 위치가 아니다.
    // 비웠으면 좌표도 함께 지운다 — 지울 방법이 없으면 잘못 붙은 핀이 영원히 남는다.
    clearPlaceId = true;
    nextSnapshot = await lookupSnapshot(nextLocation ?? undefined, trip.timezone);
  }

  const updates: Record<string, unknown> = {
    type: parsed.data.type,
    title: parsed.data.title,
    start_at: range.startAt,
    end_at: range.endAt,
    location_text: nextLocation,
    note: parsed.data.note || null,
    place_snapshot: nextSnapshot,
  };
  if (clearPlaceId) updates.place_id = null;
  const { data, error } = await supabase
    .from("itinerary_items")
    .update(updates)
    .eq("id", itemId)
    .eq("trip_id", parsed.data.tripId)
    .eq("updated_at", expectedUpdatedAt)
    .is("deleted_at", null)
    .select("id");

  if (error) return fail(dbErrorMessage("저장하지 못했습니다", error));
  if (!data || data.length === 0) {
    return conflictState(supabase, itemId, parsed.data.tripId);
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { status: "success", message: "저장했습니다." };
}

/**
 * 충돌 결과. 최신 updated_at 을 폼에 돌려줘서, 사용자가 방금 입력한 내용을 확인한 뒤
 * 그대로 다시 저장하면 이번에는 통과하게 한다. 일정이 그 사이 지워졌으면 그렇게 알린다.
 */
async function conflictState(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  itemId: string,
  tripId: string,
): Promise<ActionState> {
  const latest = await supabase
    .from("itinerary_items")
    .select("updated_at")
    .eq("id", itemId)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .maybeSingle();
  revalidatePath(`/trips/${tripId}`);
  if (latest.error || !latest.data) return fail("이 일정은 이미 지워졌거나 열 수 없습니다. 목록을 확인하세요.");
  return { ...fail(CONFLICT_MESSAGE), code: "conflict", values: { expectedUpdatedAt: String(latest.data.updated_at) } };
}

/** 같이 편집하는 사람이 먼저 저장했을 때. 화면은 최신 값으로 갱신되지만 입력한 내용은 그대로 남는다. */
const CONFLICT_MESSAGE =
  "다른 사람이 먼저 수정했습니다. 최신 내용으로 갱신했고 입력한 내용은 그대로예요. 확인한 뒤 다시 저장하세요.";

export async function deleteItemAction(formData: FormData): Promise<void> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  if (!z.uuid().safeParse(itemId).success || !z.uuid().safeParse(tripId).success) {
    throw new Error("올바르지 않은 일정입니다.");
  }
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  const { data, error } = await supabase
    .from("itinerary_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .select("id");

  if (error) throw new Error(dbErrorMessage("일정을 삭제하지 못했습니다", error));
  if (!data || data.length === 0) throw new Error("일정을 삭제할 권한이 없거나 이미 삭제되었습니다.");
  revalidatePath(`/trips/${tripId}`);
}

/**
 * 삭제한 일정을 되살린다. 삭제는 deleted_at 만 채우는 소프트 삭제라 되돌릴 수 있다.
 * 삭제 직후 "되돌리기" 알림이 부른다.
 */
export async function restoreItemsAction(tripId: string, itemIds: string[]): Promise<{ restored: number }> {
  const ids = [...new Set(itemIds)].filter((id) => z.uuid().safeParse(id).success);
  if (!z.uuid().safeParse(tripId).success || ids.length === 0) throw new Error("올바르지 않은 일정입니다.");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("로그인이 필요합니다.");

  let restored = 0;
  for (let index = 0; index < ids.length; index += BULK_DELETE_CHUNK) {
    const { data, error } = await supabase
      .from("itinerary_items")
      .update({ deleted_at: null })
      .eq("trip_id", tripId)
      .in("id", ids.slice(index, index + BULK_DELETE_CHUNK))
      .not("deleted_at", "is", null)
      .select("id");
    if (error) throw new Error(dbErrorMessage("일정을 되돌리지 못했습니다", error));
    restored += data?.length ?? 0;
  }
  if (restored > 0) revalidatePath(`/trips/${tripId}`);
  return { restored };
}

/** 한 번에 받을 수 있는 최대 개수. 전체 선택이 이보다 크면 나눠서 지워 달라고 안내한다. */
const BULK_DELETE_MAX = 1000;
/** PostgREST `in` 필터는 URL 에 실린다. 길이 제한을 넘지 않게 나눈다. */
const BULK_DELETE_CHUNK = 100;

export async function deleteItemsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tripId = text(formData, "tripId");
  const parsed = z
    .array(z.uuid())
    .min(1, "삭제할 일정을 선택하세요.")
    .max(BULK_DELETE_MAX, `한 번에 최대 ${BULK_DELETE_MAX}개까지 삭제할 수 있습니다.`)
    .safeParse(formData.getAll("itemId"));
  if (!z.uuid().safeParse(tripId).success) return fail("올바르지 않은 여행입니다.");
  if (!parsed.success) {
    // issues 가 비는 경우는 없어야 하지만, 비면 빈 오류가 뜬다.
    return fail(parsed.error.issues[0]?.message ?? "삭제할 일정을 확인하세요.");
  }

  const itemIds = [...new Set(parsed.data)];
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return fail("로그인이 필요합니다.");

  const deletedAt = new Date().toISOString();
  let deleted = 0;
  let failedChunks = 0;
  for (let index = 0; index < itemIds.length; index += BULK_DELETE_CHUNK) {
    const chunk = itemIds.slice(index, index + BULK_DELETE_CHUNK);
    const { data, error } = await supabase
      .from("itinerary_items")
      .update({ deleted_at: deletedAt })
      .eq("trip_id", tripId)
      .in("id", chunk)
      .is("deleted_at", null)
      .select("id");
    if (error) failedChunks += 1;
    else deleted += data?.length ?? 0;
  }

  if (deleted > 0) revalidatePath(`/trips/${tripId}`);

  const skipped = itemIds.length - deleted;
  if (deleted === 0) {
    return fail(
      failedChunks > 0
        ? "일정을 삭제하지 못했습니다. 잠시 후 다시 시도하세요."
        : "선택한 일정을 삭제할 권한이 없거나 이미 삭제되었습니다.",
    );
  }
  if (skipped > 0) {
    return {
      status: "error",
      message: `선택한 ${itemIds.length}개 중 ${deleted}개를 삭제했습니다. ${skipped}개는 ${
        failedChunks > 0 ? "오류로 삭제하지 못했습니다. 다시 시도하세요." : "권한이 없거나 이미 삭제되어 건너뛰었습니다."
      }`,
    };
  }
  return { status: "success", message: `일정 ${deleted}개를 삭제했습니다.` };
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
 * 결과를 돌려준다 — 아무것도 바뀌지 않았으면 "이동했습니다" 라고 말하지 않고,
 * 시각이 바뀌었으면 화면이 되돌리기를 제안한다.
 */
async function applyMove(
  tripId: string,
  itemId: string,
  plan: (items: ItineraryItem[], timezone: string) => MovePlan | null,
): Promise<MoveResult> {
  if (!z.uuid().safeParse(tripId).success || !z.uuid().safeParse(itemId).success) {
    return { status: "error", message: "올바르지 않은 일정입니다." };
  }
  const trip = await getTrip(tripId);
  if (!trip) return { status: "error", message: "여행을 찾을 수 없습니다." };
  if (trip.deletedAt) return { status: "error", message: DELETED_TRIP };

  const items = await listItems(tripId);
  const move = plan(items, trip.timezone);
  // 이미 맨 위/맨 아래거나 같은 날짜·같은 자리였다. 오류가 아니라 할 일이 없는 것이다.
  if (!move || isNoopMove(items, itemId, move, trip.timezone)) return { status: "unchanged" };
  const undo = planRestore(items, itemId, trip.timezone)!;

  const error = await callMoveItem(itemId, move);
  if (error) return { status: "error", message: error };

  revalidatePath(`/trips/${tripId}`);
  return { status: "moved", fromStartAt: undo.startAt, toStartAt: move.startAt, undo };
}

async function callMoveItem(itemId: string, move: MovePlan): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("move_item", {
    p_item_id: itemId,
    p_start_at: move.startAt,
    p_after_item_id: move.afterItemId,
  });
  return error ? dbErrorMessage("순서를 바꾸지 못했습니다", error) : null;
}

/** 폼 액션으로도 쓰인다. 날짜 이동 폼은 결과를 쓰지 않으므로 실패만 던진다. */
function throwOnError(result: MoveResult): MoveResult {
  if (result.status === "error") throw new Error(result.message);
  return result;
}

export async function moveItemUpAction(formData: FormData): Promise<MoveResult> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  return applyMove(tripId, itemId, (items, timezone) => planMoveUp(items, itemId, timezone));
}

export async function moveItemDownAction(formData: FormData): Promise<MoveResult> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  return applyMove(tripId, itemId, (items, timezone) => planMoveDown(items, itemId, timezone));
}

export async function moveItemAfterAction(formData: FormData): Promise<MoveResult> {
  const itemId = text(formData, "itemId");
  const targetId = text(formData, "targetId");
  const tripId = text(formData, "tripId");
  return applyMove(tripId, itemId, (items, timezone) => text(formData, "position") === "before"
    ? planMoveBefore(items, itemId, targetId, timezone)
    : planMoveAfter(items, itemId, targetId));
}

export async function moveItemToDayAction(formData: FormData): Promise<MoveResult> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  const date = text(formData, "date");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  }

  return throwOnError(
    await applyMove(tripId, itemId, (items, timezone) =>
      planMoveToDay(items, itemId, date, timezone),
    ),
  );
}

/**
 * 직전 이동을 되돌린다. `applyMove` 가 이동 **전에** 세운 계획(원래 시각과
 * 같은 시각의 바로 앞 항목)을 그대로 다시 적용한다.
 */
export async function undoMoveAction(formData: FormData): Promise<MoveResult> {
  const itemId = text(formData, "itemId");
  const tripId = text(formData, "tripId");
  const startAt = text(formData, "startAt");
  const afterItemId = text(formData, "afterItemId") || null;
  if (
    !z.uuid().safeParse(itemId).success ||
    !z.uuid().safeParse(tripId).success ||
    !z.iso.datetime({ offset: true }).safeParse(startAt).success ||
    (afterItemId !== null && !z.uuid().safeParse(afterItemId).success)
  ) {
    return { status: "error", message: "되돌릴 수 없는 요청입니다." };
  }
  return applyMove(tripId, itemId, (items) =>
    items.some((item) => item.id === itemId) ? { startAt, afterItemId } : null,
  );
}

