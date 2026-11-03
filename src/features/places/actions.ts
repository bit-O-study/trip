"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, type ActionState } from "@/features/trips/action-state";
import { dbErrorMessage } from "@/features/trips/db-error";
import { getTrip } from "@/features/trips/queries";
import { PLACE_CATEGORY_GROUPS, type PlaceCategoryGroup } from "@/features/places/types";
import type { ItemType } from "@/features/trips/types";
import { zonedLocalToUtc } from "@/lib/datetime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const placeItemSchema = z.object({
  tripId: z.uuid(),
  note: z.string().trim().max(2000).optional(),
  endLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional().or(z.literal("")),
  pollId: z.uuid().nullable().optional(),
  provider: z.enum(["google", "kakao"]),
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
  cuisineType: z.string().trim().max(100).nullable(),
  googleRating: z.number().min(0).max(5).nullable(),
  closedOnDate: z.boolean().nullable(),
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
  const intent = formData.get("intent") === "candidate" ? "candidate" : "schedule";
  if (typeof raw !== "string") return fail("요청이 올바르지 않습니다");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return fail("요청이 올바르지 않습니다");
  }

  const parsed = placeItemSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // zod 기본 메시지는 영어다. 이 페이로드는 검색 결과에서 만들어지므로 일반 문장으로 충분하다.
    return fail("선택한 장소 정보를 확인하세요. 다시 검색해 선택해 주세요.");
  }
  const input = parsed.data;
  const trip = await getTrip(input.tripId);
  if (!trip) return fail("여행을 찾을 수 없습니다");
  if (trip.deletedAt) return fail("휴지통에 있는 여행입니다. 복구한 뒤 수정하세요.");

  const supabase = await createSupabaseServerClient();
  let startAt: string;
  let endAt: string | null = null;
  if (intent !== "candidate" && input.categoryGroup === "lodging" && (!input.endLocal || input.endLocal <= input.startLocal)) return fail("체크아웃은 체크인 이후로 입력하세요.");
  try {
    startAt = zonedLocalToUtc(input.startLocal, trip.timezone);
    if (input.endLocal && intent !== "candidate") endAt = zonedLocalToUtc(input.endLocal, trip.timezone);
    if (endAt && endAt < startAt) return fail("종료 시각을 확인하세요.");
  } catch (caught) {
    return fail(caught instanceof Error ? caught.message : "시각을 해석할 수 없습니다");
  }
  if (intent === "candidate") {
    if (!input.pollId) return fail("후보를 넣을 투표를 선택하세요.");
    const { data: poll, error: pollError } = await supabase
      .from("restaurant_polls")
      .select("scheduled_at, status, closes_at")
      .eq("id", input.pollId)
      .eq("trip_id", input.tripId)
      .single();
    if (pollError || poll.status !== "open" || new Date(poll.closes_at) <= new Date()) {
      return fail("진행 중인 투표를 찾을 수 없습니다.");
    }
    startAt = poll.scheduled_at;
  }

  /*
   * authenticated 는 places 에 직접 쓰거나 남의 장소를 읽을 수 없다
   * (마이그레이션 20261023000002). 이 여행의 편집 권한을 확인하는
   * `trip.save_place` RPC 가 저장하고, 이미 있는 장소면 덮어쓰지 않고 id 만 준다.
   * DB 는 http(s) 가 아닌 url 을 거부하므로 그런 값은 비워서 넘긴다.
   */
  const placeRow = {
    provider: input.provider,
    provider_place_id: input.providerPlaceId,
    name: input.name,
    category: input.category,
    category_group: input.categoryGroup,
    address: input.address,
    road_address: input.roadAddress,
    phone: input.phone,
    url: input.url && /^https?:\/\//i.test(input.url) ? input.url : null,
    latitude: input.latitude,
    longitude: input.longitude,
  };

  const saved = await supabase.rpc("save_place", { p_trip_id: input.tripId, p_place: placeRow });
  if (saved.error || typeof saved.data !== "string") {
    return fail(dbErrorMessage("장소를 저장하지 못했습니다", saved.error));
  }
  const placeId: string = saved.data;

  const { data: sortOrder, error: sortError } = await supabase.rpc("next_sort_order", {
    p_trip_id: input.tripId,
    p_start_at: startAt,
  });
  if (sortError) return fail(dbErrorMessage("순서를 계산하지 못했습니다", sortError));

  const { error } = await supabase.from("itinerary_items").insert({
    trip_id: input.tripId,
    /*
     * 투표 후보는 반드시 'food' 다.
     *
     * `trip_private.can_vote_for_item()` 이 `i.type = 'food'` 를 요구한다.
     * 분류를 그대로 옮기면 명소·숙소·편의점을 후보로 넣었을 때 항목은 만들어
     * 지지만 아무도 투표할 수 없다 — 투표 버튼을 누르면 RLS 위반 오류 화면이
     * 뜨고, 후보를 넣은 사람은 왜 막혔는지 알 길이 없다.
     */
    type: intent === "candidate" ? "food" : ITEM_TYPE_BY_GROUP[input.categoryGroup],
    title: input.name,
    start_at: startAt,
    end_at: endAt,
    note: input.note || null,
    location_text: input.roadAddress ?? input.address,
    place_id: placeId,
    // 선택 시점의 사본. 외부 API 가 바뀌어도 이 값은 그대로다.
    place_snapshot: {
      provider: input.provider,
      providerPlaceId: input.providerPlaceId,
      name: input.name,
      category: input.category,
      categoryGroup: input.categoryGroup,
      address: input.address,
      roadAddress: input.roadAddress,
      phone: input.phone,
      url: placeRow.url,
      latitude: input.latitude,
      longitude: input.longitude,
      cuisineType: input.cuisineType,
      googleRating: input.googleRating,
      closedOnDate: input.closedOnDate,
      capturedAt: new Date().toISOString(),
    },
    sort_order: sortOrder,
    source: input.provider,
    status: intent === "candidate" ? "candidate" : "confirmed",
    restaurant_poll_id: intent === "candidate" ? input.pollId : null,
  });

  if (error) return fail(dbErrorMessage("일정에 추가하지 못했습니다", error));

  revalidatePath(`/trips/${input.tripId}`);
  return {
    status: "success",
    message: intent === "candidate" ? "투표 후보에 장소를 추가했습니다." : "일정에 장소를 추가했습니다.",
  };
}
