import { cache } from "react";

import type {
  ItineraryItem,
  RestaurantCandidate,
  RestaurantPollView,
  TripDetail,
  TripMember,
  TripRole,
  TripSummary,
} from "@/features/trips/types";
import { locationKey, type TravelLeg } from "@/features/trips/travel";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/user";

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

  if (error) throw new Error("여행 목록을 불러오지 못했습니다.");
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

  const [{ data, error }, role] = await Promise.all([
    supabase.from("trips").select(TRIP_COLUMNS).eq("id", tripId).maybeSingle(),
    getTripRole(tripId),
  ]);

  if (error) throw new Error("여행을 불러오지 못했습니다.");
  if (!data) return null;

  const row = data as TripRow;
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

/**
 * 현재 사용자의 역할.
 *
 * ⚠ `user_id` 조건을 빼면 안 된다. `trip_members_select` 정책은
 * `is_trip_member(trip_id)` 라 **같은 여행의 모든 멤버 행**이 보이므로,
 * trip_id 만으로 거르면 멤버가 둘 이상인 여행에서 여러 행이 돌아온다.
 * `maybeSingle()` 은 2행 이상이면 PGRST116 오류를 만들고, 그러면 `getTrip`
 * 이 통째로 던져 여행 상세·투표·편집이 전부 500 이 된다.
 */
export const getTripRole = cache(async (tripId: string): Promise<TripRole | null> => {
  // 레이아웃이 이미 부른 getCurrentUser 의 캐시를 쓴다. 요청마다 auth 왕복이 한 번이다.
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error("권한을 확인하지 못했습니다.");
  return (data?.role as TripRole | undefined) ?? null;
});

export async function listTripMembers(tripId: string): Promise<TripMember[]> {
  const supabase = await createSupabaseServerClient();
  const { data: members, error: memberError } = await supabase
    .from("trip_members")
    .select("user_id, role, joined_at")
    .eq("trip_id", tripId)
    .order("joined_at", { ascending: true });

  if (memberError) throw new Error("함께하는 사람을 불러오지 못했습니다.");
  if (!members?.length) return [];

  const userIds = members.map((member) => member.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url")
    .in("user_id", userIds);

  if (profileError) throw new Error("프로필을 불러오지 못했습니다.");
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return members.map((member) => {
    const profile = profilesById.get(member.user_id);
    return {
      userId: member.user_id,
      displayName: profile?.display_name?.trim() || "이름 없는 여행자",
      avatarUrl: profile?.avatar_url ?? null,
      role: member.role as TripRole,
      joinedAt: member.joined_at,
    };
  });
}

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
  place_id: string | null;
  place_snapshot: Record<string, unknown> | null;
  timezone: string | null;
  flight_snapshot: Record<string, unknown> | null;
};

/**
 * 좌표가 사용자가 고른 장소가 아니라 직접 입력한 글자를 자동 검색한 첫 결과인가.
 *
 * 새로 붙이는 자동 좌표는 `estimated: true` 를 단다. 그 전에 저장된 행은 표시가
 * 없으므로 "장소 행(place_id)이 없고 검색에서 고른 표시(selected)도 없는" 스냅샷을
 * 추정으로 본다.
 */
export function isEstimatedSnapshot(
  snapshot: Record<string, unknown> | null,
  placeId: string | null,
): boolean {
  if (!snapshot) return false;
  if (snapshot.estimated === true) return true;
  if (snapshot.estimated === false || snapshot.selected === true) return false;
  return placeId === null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** 항공편 표시에 쓸 공항·시간대. 스냅샷 형태가 이상하면 null. */
function readFlight(
  snapshot: Record<string, unknown> | null,
  itemTimezone: string | null,
): ItineraryItem["flight"] {
  if (!snapshot) return null;
  const departure = snapshot.departure as Record<string, unknown> | undefined;
  const arrival = snapshot.arrival as Record<string, unknown> | undefined;
  const departureTimezone = readString(departure?.timezone) ?? itemTimezone;
  const arrivalTimezone = readString(arrival?.timezone);
  if (!departureTimezone || !arrivalTimezone) return null;
  return {
    departureAirport: readString(departure?.airport),
    arrivalAirport: readString(arrival?.airport),
    departureTimezone,
    arrivalTimezone,
  };
}

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
      "id, trip_id, type, status, title, note, location_text, start_at, end_at, all_day, sort_order, updated_at, place_id, place_snapshot, timezone, flight_snapshot",
    )
    .eq("trip_id", tripId)
    .in("status", ["confirmed", "tentative"])
    .is("deleted_at", null)
    .order("start_at", { ascending: true })
    .order("sort_order", { ascending: true })
    // sort_order 가 같은 행(동시 이동)도 매번 같은 순서로. DB 의 rebalance 와 같은 규칙이다.
    .order("id", { ascending: true });

  if (error) throw new Error("일정을 불러오지 못했습니다.");

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
    coordinateEstimated: isEstimatedSnapshot(row.place_snapshot, row.place_id),
    flight: row.type === "flight" ? readFlight(row.flight_snapshot, row.timezone) : null,
  }));
}

/** 검색 공급자 판정에는 메모·항공 정보·일정 정렬이 필요하지 않다. */
export async function listItemCoordinates(tripId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("itinerary_items")
    .select("place_snapshot->latitude, place_snapshot->longitude")
    .eq("trip_id", tripId).in("status", ["confirmed", "tentative"])
    .is("deleted_at", null);
  if (error) throw new Error("일정 위치를 불러오지 못했습니다.");
  return (data ?? []).flatMap((row) => {
    const coordinate = readCoordinate(row);
    return coordinate ? [coordinate] : [];
  });
}

/** 마감이 일정을 바꾼 경우에만 다시 읽는다. 보통의 방문은 병렬 조회한다. */
export async function listTripSchedule(tripId: string) {
  let finalized = false;
  let pollError = false;
  const [items, polls] = await Promise.all([
    listItems(tripId),
    listRestaurantPolls(tripId, { onFinalized: () => { finalized = true; } })
      .catch(() => { pollError = true; return []; }),
  ]);
  return { items: finalized || pollError ? await listItems(tripId) : items, polls, pollError };
}

/** 일정 사이 이동 정보. 서버 액션 파일이 아니라 여기 둔다 — "use server" 에 두면 클라이언트가 부를 수 있는 액션이 된다. */
export async function listTravelLegs(tripId: string): Promise<TravelLeg[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("travel_legs")
    .select("trip_id, from_item_id, to_item_id, mode, minutes, distance_km, version, from_location_key, to_location_key")
    .eq("trip_id", tripId);
  if (error) throw new Error("이동 정보를 불러오지 못했습니다.");
  return (data ?? []).map((row) => ({
    tripId: row.trip_id,
    fromId: row.from_item_id,
    toId: row.to_item_id,
    mode: row.mode,
    minutes: row.minutes,
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    version: row.version,
    fromLocationKey: row.from_location_key,
    toLocationKey: row.to_location_key,
  }));
}

/**
 * 지금 일정 순서에서 유효한 이동 정보만. 사이에 다른 일정이 끼었거나 장소가 바뀐
 * 구간의 수동 거리는 더 이상 그 구간의 값이 아니다(화면도 같은 규칙으로 무효 처리한다).
 */
export function currentTravelLegs(items: ItineraryItem[], legs: TravelLeg[]): TravelLeg[] {
  const byKey = new Map(legs.map((leg) => [`${leg.fromId}:${leg.toId}`, leg]));
  const current: TravelLeg[] = [];
  for (let index = 0; index + 1 < items.length; index += 1) {
    const from = items[index];
    const to = items[index + 1];
    const leg = byKey.get(`${from.id}:${to.id}`);
    if (!leg) continue;
    const stale = leg.fromLocationKey !== locationKey(from) || leg.toLocationKey !== locationKey(to);
    current.push(stale ? { ...leg, distanceKm: null } : leg);
  }
  return current;
}

function cuisineLabel(snapshot: Record<string, unknown> | null): string {
  const explicit = snapshot?.cuisineType;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const category = snapshot?.category;
  if (typeof category === "string") {
    const parts = category.split(">").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts[1];
  }
  return snapshot?.categoryGroup === "cafe" ? "카페" : "음식점";
}

/**
 * @param options.finalize 마감이 지난 투표를 확정할지. 화면을 열 때는 확정하고,
 *   GET 내보내기처럼 부수효과가 없어야 하는 경로는 끈다.
 */
export async function listRestaurantPolls(
  tripId: string,
  options: { finalize?: boolean; onFinalized?: () => void } = {},
): Promise<RestaurantPollView[]> {
  const finalize = options.finalize ?? true;
  const supabase = await createSupabaseServerClient();
  const readPolls = () => supabase.from("restaurant_polls").select("id, title, scheduled_at, closes_at, status, winner_item_id, created_by").eq("trip_id", tripId).order("scheduled_at", { ascending: true });
  let pollsResult = await readPolls();
  if (pollsResult.error) throw new Error("투표를 불러오지 못했습니다.");
  if (!pollsResult.data?.length) return [];
  if (finalize && pollsResult.data.some((poll) => poll.status === "open" && Date.parse(poll.closes_at) <= Date.now())) {
    // 이 여행의 지난 투표만 마감한다 (전역 마감 함수는 service_role 전용이 됐다).
    const finalized = await supabase.rpc("finalize_due_restaurant_polls_for_trip", { p_trip_id: tripId });
    if (finalized.error) throw new Error("투표를 마감하지 못했습니다.");
    options.onFinalized?.();
    pollsResult = await readPolls();
  }
  const [viewer, itemsResult] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("itinerary_items")
      .select("id, restaurant_poll_id, title, location_text, place_snapshot")
      .eq("trip_id", tripId)
      .not("restaurant_poll_id", "is", null)
      .in("status", ["candidate", "confirmed", "cancelled"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
  ]);

  if (pollsResult.error) throw new Error("투표를 불러오지 못했습니다.");

  if (itemsResult.error) {
    throw new Error("음식점 후보를 불러오지 못했습니다.");
  }

  const rows = itemsResult.data as Array<{
    id: string;
    restaurant_poll_id: string;
    title: string;
    location_text: string | null;
    place_snapshot: Record<string, unknown> | null;
  }>;
  const { data: votes, error: voteError } = rows.length === 0
    ? { data: [], error: null }
    : await supabase.from("restaurant_votes").select("item_id, user_id").in("item_id", rows.map((row) => row.id));
  if (voteError) throw new Error("투표를 불러오지 못했습니다.");

  const counts = new Map<string, number>();
  const mine = new Set<string>();
  for (const vote of votes ?? []) {
    counts.set(vote.item_id, (counts.get(vote.item_id) ?? 0) + 1);
    if (vote.user_id === viewer?.id) mine.add(vote.item_id);
  }

  const candidates: RestaurantCandidate[] = rows.map((row) => ({
    id: row.id,
    pollId: row.restaurant_poll_id,
    title: row.title,
    locationText: row.location_text,
    cuisineType: cuisineLabel(row.place_snapshot),
    googleRating:
      typeof row.place_snapshot?.googleRating === "number"
        ? row.place_snapshot.googleRating
        : null,
    voteCount: counts.get(row.id) ?? 0,
    votedByMe: mine.has(row.id),
    coordinate: readCoordinate(row.place_snapshot),
    closedOnDate:
      typeof row.place_snapshot?.closedOnDate === "boolean"
        ? row.place_snapshot.closedOnDate
        : null,
  }));

  const candidatesByPoll = new Map<string, RestaurantCandidate[]>();
  for (const candidate of candidates) {
    const bucket = candidatesByPoll.get(candidate.pollId) ?? [];
    bucket.push(candidate);
    candidatesByPoll.set(candidate.pollId, bucket);
  }
  return (pollsResult.data ?? []).map((poll) => ({
    id: poll.id,
    title: poll.title,
    scheduledAt: poll.scheduled_at,
    closesAt: poll.closes_at,
    status: poll.status as RestaurantPollView["status"],
    winnerItemId: poll.winner_item_id,
    createdByMe: poll.created_by === viewer?.id,
    candidates: candidatesByPoll.get(poll.id) ?? [],
  }));
}
