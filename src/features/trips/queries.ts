import { cache } from "react";

import type {
  ItineraryItem,
  TripDetail,
  TripRole,
  TripSummary,
} from "@/features/trips/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * 읽기 전용 질의.
 *
 * RLS 가 이미 "볼 수 있는 것만" 걸러 주므로 여기서 소유권을 다시 검사하지 않는다.
 * 두 곳에서 같은 규칙을 관리하면 반드시 어긋난다. 대신 결과가 비면 없는 것으로
 * 취급한다.
 */

const TRIP_COLUMNS =
  "id, owner_id, title, description, destination_name, start_date, end_date, timezone, base_currency, status, cover_image_url, deleted_at, updated_at";

type TripRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  destination_name: string | null;
  start_date: string;
  end_date: string;
  timezone: string;
  base_currency: string;
  status: TripDetail["status"];
  cover_image_url: string | null;
  deleted_at: string | null;
  updated_at: string;
};

function toSummary(row: TripRow): TripSummary {
  return {
    id: row.id,
    title: row.title,
    destinationName: row.destination_name,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    status: row.status,
    coverImageUrl: row.cover_image_url,
    deletedAt: row.deleted_at,
  };
}

export async function listTrips(options?: { deleted?: boolean }): Promise<TripSummary[]> {
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("trips").select(TRIP_COLUMNS).order("start_date", {
    ascending: false,
  });

  const { data, error } = options?.deleted
    ? await query.not("deleted_at", "is", null)
    : await query.is("deleted_at", null);

  if (error) throw new Error(`여행 목록을 불러오지 못했습니다: ${error.message}`);
  return (data as TripRow[]).map(toSummary);
}

/**
 * 여행 상세와 현재 사용자의 역할.
 *
 * React `cache` 로 감싸 같은 렌더링 안에서 여러 번 불러도 한 번만 조회한다
 * (레이아웃과 페이지가 같은 여행을 필요로 한다).
 */
export const getTrip = cache(async (tripId: string): Promise<TripDetail | null> => {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle();

  if (error) throw new Error(`여행을 불러오지 못했습니다: ${error.message}`);
  if (!data) return null;

  const row = data as TripRow;
  const role = await getTripRole(tripId);
  // 멤버십 행이 없으면 접근할 수 없는 여행으로 취급한다.
  // (소유자는 trips 정책의 owner_id 조건으로 행은 볼 수 있으나, 그 경우에도
  //  트리거가 멤버십을 만들어 두므로 정상 상태에서는 발생하지 않는다.)
  if (!role) return null;

  return {
    ...toSummary(row),
    ownerId: row.owner_id,
    description: row.description,
    baseCurrency: row.base_currency,
    updatedAt: row.updated_at,
    role,
  };
});

export const getTripRole = cache(async (tripId: string): Promise<TripRole | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .maybeSingle();

  if (error) throw new Error(`권한을 확인하지 못했습니다: ${error.message}`);
  return (data?.role as TripRole | undefined) ?? null;
});

type ItemRow = {
  id: string;
  trip_id: string;
  type: ItineraryItem["type"];
  status: ItineraryItem["status"];
  title: string;
  note: string | null;
  location_text: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  sort_order: string | number;
  updated_at: string;
  place_snapshot: Record<string, unknown> | null;
};

/**
 * 스냅샷에서 좌표를 꺼낸다.
 *
 * place_snapshot 은 jsonb 라 형태를 보장할 수 없다. 값이 이상하면 좌표 없는
 * 항목으로 취급한다 — 지도에 엉뚱한 점을 찍는 것보다 안 찍는 편이 낫다.
 */
function readCoordinate(
  snapshot: Record<string, unknown> | null,
): { latitude: number; longitude: number } | null {
  if (!snapshot) return null;
  const latitude = snapshot.latitude;
  const longitude = snapshot.longitude;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export async function listItems(tripId: string): Promise<ItineraryItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("itinerary_items")
    .select(
      "id, trip_id, type, status, title, note, location_text, start_at, end_at, all_day, sort_order, updated_at, place_snapshot",
    )
    .eq("trip_id", tripId)
    .is("deleted_at", null)
    .order("start_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`일정을 불러오지 못했습니다: ${error.message}`);

  return (data as ItemRow[]).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    status: row.status,
    title: row.title,
    note: row.note,
    locationText: row.location_text,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    // numeric 은 정밀도 손실을 막으려고 문자열로 온다.
    sortOrder: Number(row.sort_order),
    updatedAt: row.updated_at,
    coordinate: readCoordinate(row.place_snapshot),
  }));
}
