"use client";

import { useState } from "react";

import { FlightAdd } from "@/features/flights/components/flight-add";
import { PlaceSearch } from "@/features/places/components/place-search";
import { ItemForm } from "@/features/trips/components/item-form";
import type { RestaurantPollView } from "@/features/trips/types";

type Props = {
  tripId: string;
  date: string;
  timezone: string;
  polls: RestaurantPollView[];
  initialPollId?: string;
  initialQuery?: string;
};

export function DayItemAdd({ tripId, date, timezone, polls, initialPollId, initialQuery }: Props) {
  const [mode, setMode] = useState<"place" | "flight" | "manual" | null>(initialPollId ? "place" : null);
  if (!mode) {
    return <button type="button" onClick={() => setMode("place")} className="w-full rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">+ 일정 추가</button>;
  }

  return <div id={initialPollId ? "poll-candidate-add" : undefined} className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={mode === "place"} onClick={() => setMode("place")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "place" ? "bg-primary text-primary-foreground" : "border border-border"}`}>장소 검색</button>
      <button type="button" aria-pressed={mode === "flight"} onClick={() => setMode("flight")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "flight" ? "bg-primary text-primary-foreground" : "border border-border"}`}>항공편</button>
      <button type="button" aria-pressed={mode === "manual"} onClick={() => setMode("manual")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "manual" ? "bg-primary text-primary-foreground" : "border border-border"}`}>직접 입력</button>
      <button type="button" onClick={() => setMode(null)} className="ml-auto rounded-lg border border-border px-3 py-2 text-sm">닫기</button>
    </div>
    <p className="text-xs text-muted-foreground">{date} 일정으로 추가됩니다.</p>
    {mode === "place" ? <PlaceSearch tripId={tripId} defaultDate={date} timezone={timezone} polls={polls} initialPollId={initialPollId} initialQuery={initialQuery} />
      : mode === "flight" ? <FlightAdd tripId={tripId} defaultDate={date} timezone={timezone} />
      : <ItemForm tripId={tripId} defaultDate={date} timezone={timezone} defaultOpen onCancel={() => setMode(null)} />}
  </div>;
}
