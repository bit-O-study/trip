"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import type { RestaurantPollView } from "@/features/trips/types";

const loading = () => <p role="status" className="p-3 text-sm text-muted-foreground">입력 화면을 불러오는 중…</p>;
const FlightAdd = dynamic(() => import("@/features/flights/components/flight-add").then((m) => m.FlightAdd), { loading });
const PlaceSearch = dynamic(() => import("@/features/places/components/place-search").then((m) => m.PlaceSearch), { loading });
const ItemForm = dynamic(() => import("@/features/trips/components/item-form").then((m) => m.ItemForm), { loading });

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
  const [visited, setVisited] = useState<Set<string>>(() => new Set(initialPollId ? ["place"] : []));
  function open(next: "place" | "flight" | "manual") {
    setVisited((current) => new Set([...current, next]));
    setMode(next);
  }

  return <>
    {!mode ? <button type="button" onClick={() => open("place")} className="w-full rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">+ 일정 추가</button> : null}
    <div hidden={!mode} id={initialPollId ? "poll-candidate-add" : undefined} className="scroll-mt-24 space-y-3 rounded-xl border border-border bg-card p-3">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={mode === "place"} onClick={() => open("place")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "place" ? "bg-primary text-primary-foreground" : "border border-border"}`}>장소 검색</button>
      <button type="button" aria-pressed={mode === "flight"} onClick={() => open("flight")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "flight" ? "bg-primary text-primary-foreground" : "border border-border"}`}>항공편</button>
      <button type="button" aria-pressed={mode === "manual"} onClick={() => open("manual")} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "manual" ? "bg-primary text-primary-foreground" : "border border-border"}`}>직접 입력</button>
      <button type="button" onClick={() => setMode(null)} className="ml-auto rounded-lg border border-border px-3 py-2 text-sm">닫기</button>
    </div>
    <p className="text-xs text-muted-foreground">{date} 일정으로 추가됩니다.</p>
    <div hidden={mode !== "place"}>{visited.has("place") ? <PlaceSearch tripId={tripId} defaultDate={date} timezone={timezone} polls={polls} initialPollId={initialPollId} initialQuery={initialQuery} /> : null}</div>
    <div hidden={mode !== "flight"}>{visited.has("flight") ? <FlightAdd tripId={tripId} defaultDate={date} timezone={timezone} /> : null}</div>
    <div hidden={mode !== "manual"}>{visited.has("manual") ? <ItemForm tripId={tripId} defaultDate={date} timezone={timezone} defaultOpen onCancel={() => setMode(null)} /> : null}</div>
  </div></>;
}
