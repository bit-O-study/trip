"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { IDLE, fail, type ActionState } from "@/features/trips/action-state";
import { getTrip } from "@/features/trips/queries";
import { PLACE_CATEGORY_GROUPS, type PlaceCategoryGroup } from "@/features/places/types";
import type { ItemType } from "@/features/trips/types";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const placeItemSchema = z.object({
  tripId: z.uuid(),
  providerPlaceId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(200).nullable(),
  categoryGroup: z.enum(PLACE_CATEGORY_GROUPS),
  address: z.string().trim().max(300).nullable(),
  roadAddress: z.string().trim().max(300).nullable(),
  phone: z.string().trim().max(50).nullable(),
  url: z.string().trim().max(500).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
});

/** 장소 분류를 일정 항목 종류로 옮긴다. */
const ITEM_TYPE_BY_GROUP: Record<PlaceCategoryGroup, ItemType> = {
  food: "food",
  cafe: "food",
  lodging: "lodging",
  attraction: "activity",
  shopping: "activity",
  transport: "transport",
  etc: "activity",
};

/**
 * 검색 결과를 일정에 추가한다.
 *
 * places 는 여러 여행이 공유하는 엔티티이고, itinerary_items.place_snapshot 이
 * 선택 시점의 사본을 갖는다. 나중에 Kakao 에서 그 장소가 사라지거나 이름이
 * 바뀌어도 저장된 일정은 그대로 유지된다.
 */
export async function addPlaceToTripAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") return fail("요청이 올바르지 않습니다");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return fail("요청이 올바르지 않습니다");
  }

  const parsed = placeItemSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "입력을 확인하세요");
  }
  const input = parsed.data;

  const trip = await getTrip(input.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");

  let startAt: string;
  try {
    startAt = zonedLocalToUtc(input.startLocal, trip.timezone);
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다");
  }

  const supabase = await createSupabaseServerClient();

  /*
   * authenticated 에는 places 의 INSERT 만 있고 UPDATE 가 없다(공유 행을 한
   * 사용자가 바꾸지 못하게 하려고). 그래서 upsert 를 쓸 수 없다.
   * 넣어 보고 중복(23505)이면 기존 행을 읽는다.
   */
  const placeRow = {
    provider: "kakao",
    provider_place_id: input.providerPlaceId,
    name: input.name,
    category: input.category,
    category_group: input.categoryGroup,
    address: input.address,
    road_address: input.roadAddress,
    phone: input.phone,
    url: input.url,
    latitude: input.latitude,
    longitude: input.longitude,
  };

  let placeId: string;
  const inserted = await supabase.from("places").insert(placeRow).select("id").single();

  if (inserted.error) {
    if (inserted.error.code !== "23505") {
      return fail(`장소를 저장하지 못했습니다: ${inserted.error.message}`);
    }
    const existing = await supabase
      .from("places")
      .select("id")
      .eq("provider", "kakao")
      .eq("provider_place_id", input.providerPlaceId)
      .single();
    if (existing.error) {
      return fail(`장소를 찾지 못했습니다: ${existing.error.message}`);
    }
    placeId = existing.data.id;
  } else {
    placeId = inserted.data.id;
  }

  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: input.tripId,
    p_start_at: startAt,
  });
  if (sortError) return fail(`순서를 계산하지 못했습니다: ${sortError.message}`);

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: input.tripId,
    type: ITEM_TYPE_BY_GROUP[input.categoryGroup],
    title: input.name,
    start_at: startAt,
    location_text: input.roadAddress ?? input.address,
    place_id: placeId,
    // 선택 시점의 사본. 외부 API 가 바뀌어도 이 값은 그대로다.
    place_snapshot: {
      provider: "kakao",
      providerPlaceId: input.providerPlaceId,
      name: input.name,
      category: input.category,
      categoryGroup: input.categoryGroup,
      address: input.address,
      roadAddress: input.roadAddress,
      phone: input.phone,
      url: input.url,
      latitude: input.latitude,
      longitude: input.longitude,
      capturedAt: new Date().toISOString(),
    },
    sort_order: sortOrder,
    source: "kakao",
  });

  if (error) return fail(`일정에 추가하지 못했습니다: ${error.message}`);

  revalidatePath(`/trips/${input.tripId}`);
  return IDLE;
}
