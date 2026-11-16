import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SavedRestaurant } from "./model";

export async function listSavedRestaurants(tripId: string): Promise<SavedRestaurant[]> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("saved_restaurants")
    .select("reservation_status,reservation_note,reservation_url,id,trip_id,name,original_name,region,menu,note,address,latitude,longitude,updated_at,item_id,meal,itinerary_items(id,start_at,updated_at,status,deleted_at)")
    .eq("trip_id", tripId).order("created_at");
  if (error) throw new Error("맛집 보관함을 불러오지 못했습니다. 새로고침해 주세요.");
  return data as unknown as SavedRestaurant[];
}
