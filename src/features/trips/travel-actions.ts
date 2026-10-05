"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTrip, listItems } from "./queries";
import { canEdit } from "./types";
import { locationKey, travelInput, type TravelLeg } from "./travel";
import { fail, type ActionState } from "./action-state";

export async function listTravelLegs(tripId: string): Promise<TravelLeg[]> {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("travel_legs").select("*").eq("trip_id", tripId);
  if (error) throw new Error("이동 정보를 불러오지 못했습니다.");
  return (data ?? []).map((r) => ({ tripId: r.trip_id, fromId: r.from_item_id, toId: r.to_item_id, mode: r.mode, minutes: r.minutes, distanceKm: r.distance_km === null ? null : Number(r.distance_km), version: r.version, fromLocationKey: r.from_location_key, toLocationKey: r.to_location_key }));
}

export async function saveTravelLeg(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = travelInput.safeParse({ tripId: form.get("tripId"), fromId: form.get("fromId"), toId: form.get("toId"), version: form.get("version"), mode: form.get("mode") || null, minutes: form.get("minutes"), distanceKm: form.get("distanceKm") });
  if (!parsed.success) return fail("이동수단·시간·거리를 확인하세요.");
  const { tripId, fromId, toId, version, mode, minutes, distanceKm } = parsed.data;
  const trip = await getTrip(tripId);
  if (!trip || trip.deletedAt || !canEdit(trip.role)) return fail("이동 정보를 수정할 수 없습니다.");
  const items = await listItems(tripId);
  const i = items.findIndex((item) => item.id === fromId);
  if (i < 0 || items[i + 1]?.id !== toId) return fail("일정 순서가 변경되었습니다. 새로고침 후 다시 입력하세요.");
  const db = await createSupabaseServerClient();
  const values = { mode, minutes, distance_km: distanceKm, from_location_key: locationKey(items[i]), to_location_key: locationKey(items[i + 1]), version: version + 1 };
  const result = version === 0
    ? await db.from("travel_legs").insert({ ...values, trip_id: tripId, from_item_id: fromId, to_item_id: toId }).select("version")
    : await db.from("travel_legs").update(values).eq("trip_id", tripId).eq("from_item_id", fromId).eq("to_item_id", toId).eq("version", version).select("version");
  if (result.error?.code === "23505" || (!result.error && !result.data?.length)) return fail("다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도하세요.");
  if (result.error) return fail("이동 정보를 저장하지 못했습니다. 다시 시도하세요.");
  revalidatePath(`/trips/${tripId}`);
  return { status: "success", message: "이동 정보를 저장했습니다." };
}
