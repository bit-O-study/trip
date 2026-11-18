import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PackingItem } from "./model";

export async function listPackingItems(tripId: string): Promise<PackingItem[]> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("packing_items").select("id,title,category,checked,updated_at")
    .eq("trip_id", tripId).order("created_at").order("id").limit(300);
  if (error) throw new Error("준비물을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return data as PackingItem[];
}
