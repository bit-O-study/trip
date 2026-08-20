"use client";

import { useActionState, useState, type FormEvent } from "react";

import { addPlaceToTripAction } from "@/features/places/actions";
import { PLACE_CATEGORY_LABELS, type PlaceSearchResult } from "@/features/places/types";
import { IDLE, type ActionState } from "@/features/trips/action-state";
import { openDatePicker } from "@/lib/date-picker";

const CATEGORY_FILTERS = [
  { code: "FD6", label: "맛집" },
  { code: "CE7", label: "카페" },
  { code: "AD5", label: "숙소" },
  { code: "AT4", label: "명소" },
] as const;

type Props = {
  tripId: string;
  /** 추가할 때 기본으로 채울 날짜 */
  defaultDate: string;
  timezone: string;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "done"; results: PlaceSearchResult[]; reachableCount: number; totalCount: number };

export function PlaceSearch({ tripId, defaultDate, timezone }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null);
  const [startLocal, setStartLocal] = useState(`${defaultDate}T09:00`);

  const [addState, addAction, adding] = useActionState<ActionState, FormData>(
    addPlaceToTripAction,
    IDLE,
  );

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setSearch({ status: "loading" });
    setSelected(null);

    try {
      const url = new URL("/api/places/search", window.location.origin);
      url.searchParams.set("q", trimmed);
      if (category) url.searchParams.set("category", category);

      const response = await fetch(url);
      const body = await response.json();

      if (!response.ok) {
        setSearch({
          status: "error",
          message: body.error ?? "장소를 검색하지 못했습니다.",
          // 설정 누락은 사용자가 재시도해도 소용없다.
          retryable: body.kind !== "not_configured",
        });
        return;
      }

      setSearch({
        status: "done",
        results: body.results,
        reachableCount: body.reachableCount,
        totalCount: body.totalCount,
      });
    } catch {
      setSearch({
        status: "error",
        message: "검색 요청이 실패했습니다. 네트워크를 확인하세요.",
        retryable: true,
      });
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">장소 검색</h2>

      <form onSubmit={runSearch} className="space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이치란 라멘, 신주쿠 호텔…"
            aria-label="장소 검색어"
            maxLength={80}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <button
            type="submit"
            disabled={search.status === "loading"}
            className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            검색
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((filter) => {
            const active = category === filter.code;
            return (
              <button
                key={filter.code}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(active ? null : filter.code)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </form>

      {search.status === "loading" ? (
        <p className="text-sm text-muted-foreground">검색 중…</p>
      ) : null}

      {search.status === "error" ? (
        <div role="alert" className="space-y-1 rounded-lg border border-border px-3 py-3">
          <p className="text-sm text-danger">{search.message}</p>
          {/*
            degraded mode — 검색이 막혀도 앱을 못 쓰는 게 아니다.
            직접 입력으로 일정을 계속 만들 수 있다는 걸 알려준다.
          */}
          <p className="text-sm text-muted-foreground">
            {search.retryable
              ? "잠시 후 다시 시도하거나, 아래 '일정 추가'로 직접 입력하세요."
              : "아래 '일정 추가'로 직접 입력할 수 있습니다."}
          </p>
        </div>
      ) : null}

      {search.status === "done" ? (
        search.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {search.totalCount > search.reachableCount
                ? `${search.totalCount.toLocaleString()}건 중 ${search.reachableCount}건까지 볼 수 있습니다. 검색어를 좁히면 더 정확합니다.`
                : `${search.results.length}건`}
            </p>
            <ul className="space-y-2">
              {search.results.map((place) => (
                <li
                  key={place.providerPlaceId}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{place.name}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {PLACE_CATEGORY_LABELS[place.categoryGroup]}
                      {place.roadAddress ? ` · ${place.roadAddress}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(place)}
                    className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      {selected ? (
        <form action={addAction} className="space-y-3 rounded-lg border border-primary px-3 py-3">
          <p className="text-sm">
            <span className="font-medium">{selected.name}</span> 을(를) 일정에 추가합니다.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="place-start" className="text-sm font-medium">
              방문 시각
            </label>
            <input
              id="place-start"
              type="datetime-local"
              onClick={openDatePicker}
              value={startLocal}
              onChange={(event) => setStartLocal(event.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
            />
            <p className="text-xs text-muted-foreground">현지 시간({timezone}) 기준입니다.</p>
          </div>

          <input
            type="hidden"
            name="payload"
            value={JSON.stringify({ ...selected, tripId, startLocal })}
          />

          {addState.status === "error" && addState.message ? (
            <p role="alert" className="text-sm text-danger">
              {addState.message}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              일정에 추가
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
