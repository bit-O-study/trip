"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { TripSummary } from "../types";
import { departureLabel, PHASE_LABELS, travelPhase, type TravelPhase } from "../overview";
import { tripDurationLabel } from "@/lib/datetime";

export function TripList({ trips, now }: { trips: TripSummary[]; now: string }) {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<TravelPhase | "all">("all");
  const [sort, setSort] = useState("soon");
  const indexed = useMemo(() => trips.map((trip) => ({
    ...trip, phase: travelPhase(trip, now),
    searchText: `${trip.title} ${trip.destinationName ?? ""}`.toLocaleLowerCase(),
    departure: departureLabel(trip, now),
  })), [trips, now]);
  const counts = useMemo(() => {
    const counts = { ongoing: 0, upcoming: 0, past: 0 };
    for (const trip of indexed) counts[trip.phase]++;
    return counts;
  }, [indexed]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = indexed.filter((trip) =>
    (phase === "all" || trip.phase === phase) && trip.searchText.includes(normalizedQuery),
  ).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title, "ko");
    if (sort === "recent") return b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id);
    const rank = { ongoing: 0, upcoming: 1, past: 2 };
    const difference = rank[a.phase] - rank[b.phase];
    return difference || (a.phase === "past" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)) || a.id.localeCompare(b.id);
  });

  return <section className="space-y-4" aria-label="여행 찾아보기">
    <div className="grid grid-cols-3 gap-2">
      {(Object.keys(PHASE_LABELS) as TravelPhase[]).map((key) => <button key={key} type="button"
        aria-pressed={phase === key} onClick={() => setPhase(phase === key ? "all" : key)}
        className={`rounded-xl border p-3.5 text-left shadow-[var(--shadow-card)] transition-colors ${phase === key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:border-foreground/30"}`}>
        <span className={`block text-xs ${phase === key ? "text-background/70" : "text-muted-foreground"}`}>{PHASE_LABELS[key]}</span>
        <span className="mt-1 block font-mono text-2xl font-semibold tracking-tight">{counts[key]}</span>
      </button>)}
    </div>
    <div className="flex flex-wrap gap-3">
      <label className="min-w-0 flex-1 space-y-1 text-sm">여행 검색
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="여행 이름 또는 도시" className="block w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-base" />
      </label>
      <label className="space-y-1 text-sm">정렬
        <select value={sort} onChange={(event) => setSort(event.target.value)} className="block rounded-lg border border-border bg-card px-3.5 py-2.5 text-base">
          <option value="soon">가까운 여행순</option><option value="recent">시작일 최신순</option><option value="title">이름순</option>
        </select>
      </label>
    </div>
    <div className="flex items-center justify-between gap-2 text-sm">
      <p role="status">{phase === "all" ? "전체 여행" : PHASE_LABELS[phase]} · {visible.length}개</p>
      {phase !== "all" || query ? <button type="button" onClick={() => { setPhase("all"); setQuery(""); }} className="min-h-10 px-2 font-medium underline underline-offset-4">필터 초기화</button> : null}
    </div>
    {visible.length ? <ul className="grid gap-3 md:grid-cols-2">{visible.map((trip) => <li key={trip.id}>
      <Link href={`/trips/${trip.id}`} className="ticket group block h-full transition-shadow hover:shadow-[var(--shadow-lift)]">
        <div className="flex items-start justify-between gap-3 p-4 pb-4">
          <div className="min-w-0 space-y-1">
            <h2 className="break-words text-lg font-semibold leading-snug">{trip.title}</h2>
            <p className="break-words text-sm text-muted-foreground">{trip.destinationName || "목적지 미정"}</p>
          </div>
          <span className={`shrink-0 whitespace-nowrap border-l-2 border-dashed border-rail pl-3 text-right leading-none ${trip.departure.startsWith("D-") ? "font-mono text-lg font-semibold tracking-tight" : "text-sm font-medium text-muted-foreground"}`}>{trip.departure}</span>
        </div>
        <div className="ticket-perf" aria-hidden />
        <p className="px-4 py-3 font-mono text-xs text-muted-foreground">{trip.startDate} → {trip.endDate} · {tripDurationLabel(trip.startDate, trip.endDate)}</p>
      </Link>
    </li>)}</ul> : <p className="rounded-xl border-2 border-dashed border-rail bg-card p-8 text-center text-sm text-muted-foreground">조건에 맞는 여행이 없습니다. 검색어나 상태 필터를 바꿔 보세요.</p>}
  </section>;
}
