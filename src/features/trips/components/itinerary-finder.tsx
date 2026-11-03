"use client";

import { useState } from "react";
import { ITEM_TYPE_LABELS, type ItineraryItem } from "../types";
import { zonedDateKey, zonedTimeLabel } from "@/lib/datetime";
import { timelineItemDomId, useItemSelection } from "./trip-board";

export function ItineraryFinder({ items, timezone }: { items: ItineraryItem[]; timezone: string }) {
  const [query, setQuery] = useState("");
  const { select } = useItemSelection();
  const matches = query.trim() ? items.filter((item) => `${item.title} ${item.locationText ?? ""} ${item.note ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  return <section className="space-y-2 rounded-xl border border-border p-4" aria-label="일정 빠른 찾기">
    <label htmlFor="itinerary-search" className="text-sm font-medium">일정 빠른 찾기</label>
    <input id="itinerary-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="일정 이름, 주소, 메모 검색" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base" />
    {query.trim() ? <>
      <p role="status" className="text-xs text-muted-foreground">{matches.length ? `${matches.length}개 일정 · 선택하면 해당 일정으로 이동합니다.` : "검색 결과가 없습니다."}</p>
      <ul className="max-h-64 space-y-1 overflow-y-auto">{matches.map((item) => <li key={item.id}><a href={`#${timelineItemDomId(item.id)}`} onClick={() => {
        select(item.id, "timeline");
        document.getElementById(timelineItemDomId(item.id))?.querySelector<HTMLElement>("[data-select-item]")?.focus({ preventScroll: true });
      }} className="block rounded-lg px-3 py-2 hover:bg-muted">
        <span className="block break-words text-sm font-medium">{item.title}</span>
        <span className="text-xs text-muted-foreground">{zonedDateKey(item.startAt, timezone)} · {item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)} · {ITEM_TYPE_LABELS[item.type]}</span>
      </a></li>)}</ul>
    </> : <p className="text-xs text-muted-foreground">여행 기간 밖에 있는 일정도 함께 검색합니다.</p>}
  </section>;
}
