import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Expense } from "./model";

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const client = await createSupabaseServerClient();
  const rows: Expense[] = [];
  // PostgREST caps each response; fetch every page so totals never silently truncate.
  for (let start = 0; ; start += 500) {
    const { data, error } = await client.from("expenses").select("id,title,category,spent_on,amount_minor,currency,note,updated_at")
      .eq("trip_id", tripId).order("spent_on", { ascending: false }).order("id").range(start, start + 499);
    if (error) throw new Error("지출 내역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    rows.push(...data as Expense[]);
    if (data.length < 500) return rows;
  }
}
