"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

import type { RestaurantPollView } from "@/features/trips/types";

const loading = () => <p role="status" className="p-3 text-sm text-muted-foreground">입력 화면을 불러오는 중…</p>;
const FlightAdd = dynamic(() => import("@/features/flights/components/flight-add").then((m) => m.FlightAdd), { loading });
const PlaceSearch = dynamic(() => import("@/features/places/components/place-search").then((m) => m.PlaceSearch), { loading });
const ItemForm = dynamic(() => import("@/features/trips/components/item-form").then((m) => m.ItemForm), { loading });

type Props = {
  tripId: string;
  date: string;
  /** 새 일정의 시작 시각 기본값("HH:MM"). 그날 마지막 일정이 끝나는 시각. */
  defaultTime?: string;
  timezone: string;
  polls: RestaurantPollView[];
  initialPollId?: string;
  initialQuery?: string;
};

type Mode = "place" | "flight" | "manual";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "place", label: "장소 검색" },
  { mode: "flight", label: "항공편" },
  { mode: "manual", label: "직접 입력" },
];

/**
 * 일정 추가. 화면 아래에서 올라오는 시트(데스크톱은 가운데 창)로 연다.
 *
 * 긴 일정 목록 한가운데에 큰 입력 패널이 끼어들면 목록이 밀려나고 화면이 여러 번 튄다.
 * 시트는 목록 위에 떠 있어서 닫으면 보던 자리 그대로 돌아온다.
 * 한 번 연 입력 화면은 닫아도 DOM 에 남겨(hidden) 입력 중이던 초안이 보존된다.
 */
export function DayItemAdd({ tripId, date, defaultTime, timezone, polls, initialPollId, initialQuery }: Props) {
  const [mode, setMode] = useState<Mode | null>(initialPollId ? "place" : null);
  const [visited, setVisited] = useState<Set<string>>(() => new Set(initialPollId ? ["place"] : []));
  const dialog = useRef<HTMLDivElement>(null);
  const isOpen = mode !== null;

  function open(next: Mode) {
    setVisited((current) => new Set([...current, next]));
    setMode(next);
  }

  useEffect(() => {
    if (!isOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    // 뒤의 목록이 같이 스크롤되면 시트 안에서 손가락이 어긋난다.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMode(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, [isOpen]);

  return <>
    {!isOpen ? <button type="button" onClick={() => open("place")} className="w-full rounded-xl border-2 border-dashed border-rail bg-card px-4 py-3.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">+ 일정 추가</button> : null}
    {isOpen ? <div aria-hidden className="fixed inset-0 z-40 bg-black/45" onClick={() => setMode(null)} /> : null}
    <div
      ref={dialog}
      hidden={!isOpen}
      role="dialog"
      aria-modal={isOpen}
      aria-label={`${date} 일정 추가`}
      tabIndex={-1}
      id={initialPollId ? "poll-candidate-add" : undefined}
      className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-card px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[var(--shadow-lift)] outline-none md:inset-auto md:left-1/2 md:top-1/2 md:w-[min(38rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:pb-5"
    >
      <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-rail md:hidden" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold tracking-tight">일정 추가</h3>
          <p className="text-xs text-muted-foreground">{date} 일정으로 추가됩니다.</p>
        </div>
        <button type="button" onClick={() => setMode(null)} aria-label="일정 추가 닫기" className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-lg leading-none text-muted-foreground hover:text-foreground">×</button>
      </div>
      <div role="group" aria-label="추가 방식" className="mt-3 flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button key={tab.mode} type="button" aria-pressed={mode === tab.mode} onClick={() => open(tab.mode)} className={`rounded-full px-4 py-2 text-sm font-medium ${mode === tab.mode ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}>{tab.label}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <div hidden={mode !== "place"}>{visited.has("place") ? <PlaceSearch tripId={tripId} defaultDate={date} defaultTime={defaultTime} timezone={timezone} polls={polls} initialPollId={initialPollId} initialQuery={initialQuery} /> : null}</div>
        <div hidden={mode !== "flight"}>{visited.has("flight") ? <FlightAdd tripId={tripId} defaultDate={date} timezone={timezone} /> : null}</div>
        <div hidden={mode !== "manual"}>{visited.has("manual") ? <ItemForm tripId={tripId} defaultDate={date} defaultTime={defaultTime} timezone={timezone} defaultOpen onCancel={() => setMode(null)} /> : null}</div>
      </div>
    </div></>;
}
