import { createHash } from "node:crypto";

import type { SharedItem, SharedTrip } from "@/features/share/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * 공개 공유 링크 전용 서버 모듈.
 *
 * **이 파일이 service role 클라이언트를 쓰는 유일한 곳이다.** 공유 뷰는 로그인
 * 하지 않은 방문자에게 여행을 보여 줘야 해서 RLS 로 표현할 수 없고, 그래서
 * RLS 를 우회한다. 우회 경로가 여러 곳으로 퍼지면 RLS 전체가 장식이 된다
 * (docs/architecture.md §6 "격리").
 *
 * 규칙 두 가지.
 *   1. 여기서 내보내는 것은 화이트리스트로 고른 필드뿐이다. 행을 그대로
 *      돌려주지 않는다.
 *   2. 토큰은 해시로만 비교한다. 원본은 저장하지 않는다.
 */

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 공유 링크를 **읽는** 쪽이 동작할 수 있는 상태인지.
 *
 * 발급은 로그인한 owner 가 하므로 평범한 클라이언트로 되지만, 열람은 로그인
 * 하지 않은 방문자라 service role 이 필요하다. 키가 없으면 링크는 만들어지되
 * 아무도 열지 못하는 상태가 되므로, 화면이 그 사실을 말할 수 있게 노출한다.
 * (키가 없을 때 그냥 던지면 공개 경로가 스택 트레이스와 함께 500 이 된다.)
 */
export function isShareReadable(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export type ShareGrant = { shortId: string; tripId: string };

/**
 * 토큰을 검증한다. 만료·폐기됐거나 없는 토큰이면 null.
 *
 * 성공하면 열람 기록을 남긴다. owner 가 "이 링크가 실제로 쓰이고 있는지" 를
 * 볼 수 있어야 폐기 여부를 판단할 수 있다.
 */
export async function redeemShareToken(token: string): Promise<ShareGrant | null> {
  if (!token || !isShareReadable()) return null;
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("trip_share_links")
    .select("id, trip_id, short_id, expires_at, revoked_at, access_count")
    .eq("token_hash", hashShareToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;

  await supabase
    .from("trip_share_links")
    .update({
      last_accessed_at: new Date().toISOString(),
      access_count: Number(data.access_count ?? 0) + 1,
    })
    .eq("id", data.id);

  return { shortId: data.short_id, tripId: data.trip_id };
}

/**
 * 쿠키에 담긴 토큰이 이 short_id 를 볼 자격이 있는지 확인한다.
 *
 * short_id 만으로 판정하면 아무나 주소만 바꿔 다른 여행을 열 수 있다.
 * 쿠키의 토큰이 그 행의 해시와 맞아야 하고, 그 행의 short_id 가 요청한 것과
 * 같아야 한다. 열람 기록은 여기서 올리지 않는다 — 새로고침마다 세는 값이
 * 되면 "몇 명이 봤는가" 를 알 수 없다.
 */
export async function verifyShareCookie(
  token: string | undefined,
  shortId: string,
): Promise<ShareGrant | null> {
  if (!token || !isShareReadable()) return null;
  const supabase = createSupabaseServiceRoleClient();

  const { data, error } = await supabase
    .from("trip_share_links")
    .select("trip_id, short_id, expires_at, revoked_at")
    .eq("token_hash", hashShareToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.short_id !== shortId) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) <= new Date()) return null;

  return { shortId: data.short_id, tripId: data.trip_id };
}

function readCoordinate(
  snapshot: Record<string, unknown> | null,
): { latitude: number; longitude: number } | null {
  if (!snapshot) return null;
  const { latitude, longitude } = snapshot;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

/** 공유 뷰가 그릴 값. 필드는 SharedTrip 이 정한 것만 나간다. */
export async function loadSharedTrip(grant: ShareGrant): Promise<SharedTrip | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("title, destination_name, start_date, end_date, timezone, deleted_at")
    .eq("id", grant.tripId)
    .maybeSingle();

  // 삭제된 여행은 링크가 살아 있어도 보여 주지 않는다.
  if (tripError || !trip || trip.deleted_at) return null;

  const { data: rows, error: itemsError } = await supabase
    .from("itinerary_items")
    .select("id, type, title, note, location_text, start_at, end_at, all_day, place_snapshot")
    .eq("trip_id", grant.tripId)
    // 소유자가 감춘 항목은 공개 링크에 나가지 않는다.
    .eq("share_visibility", "visible")
    .in("status", ["confirmed", "tentative"])
    .is("deleted_at", null)
    .order("start_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (itemsError) return null;

  const items: SharedItem[] = (rows ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    note: row.note,
    locationText: row.location_text,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    coordinate: readCoordinate(row.place_snapshot),
  }));

  return {
    shortId: grant.shortId,
    title: trip.title,
    destinationName: trip.destination_name,
    startDate: trip.start_date,
    endDate: trip.end_date,
    timezone: trip.timezone,
    items,
  };
}
