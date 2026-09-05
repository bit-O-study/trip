import type { ShareLinkSummary } from "@/features/share/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * 이 여행의 공개 공유 링크 목록.
 *
 * `token_hash` 는 절대 읽지 않는다. 화면에 쓸 일이 없고, 실수로라도 클라이언트
 * 번들에 실리면 안 된다. RLS 가 owner 에게만 이 테이블을 보여 준다.
 */
export async function listShareLinks(tripId: string): Promise<ShareLinkSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("trip_share_links")
    .select("id, short_id, expires_at, revoked_at, last_accessed_at, access_count, created_at")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  // owner 가 아니면 정책이 빈 결과를 준다. 오류가 아니라 "없음" 이다.
  if (error) throw new Error(`공유 링크를 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    shortId: row.short_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastAccessedAt: row.last_accessed_at,
    accessCount: Number(row.access_count ?? 0),
    createdAt: row.created_at,
  }));
}
