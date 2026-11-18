import { z } from "zod";
import { zonedDateKey } from "@/lib/datetime";

export const MEALS = ["아침", "점심", "저녁", "간식"] as const;
export type Meal = typeof MEALS[number];
export const MEAL_TIMES: Record<Meal, string> = { 아침: "08:00", 점심: "12:00", 저녁: "18:00", 간식: "15:00" };
export const RESERVATION_LABELS = { unknown: "예약 미확인", available: "예약 가능", unavailable: "예약 불가" } as const;
export type SavedRestaurant = {
  reservation_status: keyof typeof RESERVATION_LABELS; reservation_note: string; reservation_url: string;
  id: string; trip_id: string; name: string; original_name: string; region: string;
  menu: string; note: string; address: string; latitude: number | null; longitude: number | null;
  updated_at: string; item_id: string | null; meal: Meal | null;
  candidate_date?: string | null; candidate_meal?: Meal | null;
  itinerary_items: { id: string; start_at: string; updated_at: string; status: string; deleted_at: string | null } | null;
};
export function restaurantName(value: { name: string; original_name: string }) {
  return value.original_name && value.original_name !== value.name ? `${value.name}(${value.original_name})` : value.name;
}
const REGION_NAMES: Record<string, string> = { 高雄: "가오슝(高雄)", 高雄市: "가오슝(高雄)", 가오슝: "가오슝(高雄)", 台南: "타이난(台南)", 臺南: "타이난(台南)", 台南市: "타이난(台南)", 타이난: "타이난(台南)", 台北: "타이베이(台北)", 臺北: "타이베이(台北)", 台北市: "타이베이(台北)", 타이베이: "타이베이(台北)" };
export function regionName(region: string) { return REGION_NAMES[region.trim()] ?? region.trim(); }
export function scheduledItem(value: SavedRestaurant) {
  return value.itinerary_items && !value.itinerary_items.deleted_at && value.itinerary_items.status !== "cancelled" ? value.itinerary_items : null;
}
export function mealSlot(value: SavedRestaurant, timezone: string): { date: string; meal: Meal | null } | null {
  const item = scheduledItem(value);
  if (item) return { date: zonedDateKey(item.start_at, timezone), meal: value.meal };
  return value.candidate_date && value.candidate_meal ? { date: value.candidate_date, meal: value.candidate_meal } : null;
}
export const restaurantSchema = z.object({
  reservationStatus: z.enum(["unknown", "available", "unavailable"]).default("unknown"),
  reservationNote: z.string().trim().max(500).default(""),
  reservationUrl: z.union([z.literal(""), z.url().max(500).refine(value=>/^https?:\/\//.test(value))]).default(""),
  name: z.string().trim().min(1).max(100), originalName: z.string().trim().max(100),
  region: z.string().trim().min(1).max(80), menu: z.string().trim().max(200),
  note: z.string().trim().max(2000), address: z.string().trim().max(300),
  latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable(),
}).refine(v => (v.latitude === null) === (v.longitude === null));
