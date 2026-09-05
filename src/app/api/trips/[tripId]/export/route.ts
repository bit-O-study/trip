import { NextResponse } from "next/server";
import { z } from "zod";

import { buildTripExport, exportFileName } from "@/features/trips/export";

/**
 * 여행 전체 JSON 내보내기.
 *
 * 접근 판정은 RLS 가 한다 — 볼 수 없는 여행은 `buildTripExport` 가 null 을
 * 돌려주고, 여기서는 그것을 404 로 옮긴다. 403 으로 구분해 주면 uuid 를 넣어
 * 보며 어떤 여행이 존재하는지 알아낼 수 있다.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ tripId: string }> },
) {
  const { tripId } = await params;
  if (!z.uuid().safeParse(tripId).success) {
    return NextResponse.json({ error: "여행을 찾을 수 없습니다" }, { status: 404 });
  }

  const data = await buildTripExport(tripId);
  if (!data) {
    return NextResponse.json({ error: "여행을 찾을 수 없습니다" }, { status: 404 });
  }

  const fileName = exportFileName(String(data.trip.title ?? "trip"), data.exportedAt);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // RFC 5987 — 한글 제목이 그대로 파일 이름이 되게 한다.
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
