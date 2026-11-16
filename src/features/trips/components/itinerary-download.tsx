"use client";

import { useState } from "react";
import { LoadingStatus } from "@/components/ui/loading-status";
import type { ItineraryItem, TripSummary } from "../types";
import { itineraryDocument, itineraryFilename } from "../itinerary-document";
import { useTripDay } from "./trip-board";

export function ItineraryDownload({ trip, items }: { trip: TripSummary; items: ItineraryItem[] }) {
  const { date } = useTripDay();
  const [busy, setBusy] = useState<"pdf" | "jpg" | null>(null);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [message, setMessage] = useState("");
  async function download(format: "pdf" | "jpg") {
    setBusy(format); setMessage("");
    try {
      const doc = itineraryDocument(trip, items, date, includeNotes);
      const { renderItineraryDocument } = await import("../render-itinerary-document");
      const blob = await renderItineraryDocument(doc, format);
      const { saveItineraryFile } = await import("../save-itinerary-file");
      setMessage(await saveItineraryFile(blob, itineraryFilename(trip.title, doc.scope, format)));
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(null); }
  }
  return <section aria-label="일정 다운로드" className="space-y-2 rounded-xl border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-sm font-semibold">일정 다운로드</h2><p className="mt-1 text-xs text-muted-foreground">{date ? `${date} 일정` : "전체 일정"}을 문서나 이미지로 저장합니다.</p></div>
      <div className="flex gap-2">{(["pdf", "jpg"] as const).map((format) => <button key={format} type="button" disabled={busy !== null} onClick={() => download(format)} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">{busy === format ? "만드는 중…" : `${format.toUpperCase()} 다운로드`}</button>)}</div>
    </div>
    <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} disabled={busy !== null} />메모 포함</label>
    <p className="text-xs text-muted-foreground">날짜·시간·장소를 담은 일정표입니다. 지도는 포함하지 않습니다.</p>
    {busy ? <LoadingStatus label={`${busy.toUpperCase()} 파일 만드는 중…`} className="justify-start py-2" /> : message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
