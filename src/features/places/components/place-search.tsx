"use client";

import { useActionState, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { addPlaceToTripAction } from "@/features/places/actions";
import { PLACE_CATEGORY_LABELS, type PlaceSearchResult } from "@/features/places/types";
import { IDLE, type ActionState } from "@/features/trips/action-state";
import type { RestaurantPollView } from "@/features/trips/types";
import { openDatePicker } from "@/lib/date-picker";

const CATEGORY_FILTERS = [
  { code: "food", label: "맛집" },
  { code: "cafe", label: "카페" },
  { code: "lodging", label: "숙소" },
  { code: "attraction", label: "명소" },
] as const;

type Props = {
  tripId: string;
  /** 추가할 때 기본으로 채울 날짜 */
  defaultDate: string;
  /** 시작 시각 기본값("HH:MM"). 그날 마지막 일정이 끝나는 시각. */
  defaultTime?: string;
  timezone: string;
  polls: RestaurantPollView[];
  initialPollId?: string;
  initialQuery?: string;
  onSelect?: (place: PlaceSearchResult) => void;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "done"; results: PlaceSearchResult[]; reachableCount: number; totalCount: number; page: number; hasMore: boolean; notice?: string };

function dateInTimezone(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function PlaceSearch({ tripId, defaultDate, defaultTime = "09:00", timezone, polls, initialPollId, initialQuery = "", onSelect }: Props) {
  const sectionRef = useRef<HTMLElement>(null);
  const startId = useId();
  const requestRef = useRef<AbortController | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState("");
  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null);
  const [note, setNote] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [startLocal, setStartLocal] = useState(`${defaultDate}T${defaultTime}`);
  const openPolls = polls.filter((poll) => poll.status === "open");
  /*
   * 투표가 여럿이면 기본 선택을 두지 않는다. 첫 투표를 미리 골라 두면
   * "투표 후보로 등록" 을 눌렀을 때 엉뚱한 투표에 조용히 들어간다.
   */
  const [pollId, setPollId] = useState(
    openPolls.some((poll) => poll.id === initialPollId)
      ? initialPollId!
      : openPolls.length === 1
        ? openPolls[0].id
        : "",
  );

  const [addState, addAction, adding] = useActionState<ActionState, FormData>(
    async (previous, form) => {
      const result = await addPlaceToTripAction(previous, form);
      if (result.status === "success") { setSelected(null); setNote(""); setEndLocal(""); }
      return result;
    },
    IDLE,
  );

  function cancelSearch() {
    requestRef.current?.abort();
    requestRef.current = null;
    setLoadingMore(false);
    setPageError("");
    setSearch({ status: "idle" });
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>, page = 1) {
    event?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const previous = page > 1 && search.status === "done" ? search : null;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    setPageError("");
    if (previous) setLoadingMore(true);
    else setSearch({ status: "loading" });
    setSelected(null);

    try {
      const url = new URL("/api/places/search", window.location.origin);
      // 공급자(Kakao/Google)는 서버가 이 여행을 보고 정한다.
      url.searchParams.set("tripId", tripId);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("page", String(page));
      if (category) url.searchParams.set("category", category);
      const selectedPoll = polls.find((poll) => poll.id === pollId);
      url.searchParams.set("date", selectedPoll ? dateInTimezone(selectedPoll.scheduledAt, timezone) : startLocal.slice(0, 10));

      const response = await fetch(url, { signal: controller.signal });
      const body = await response.json();
      if (requestRef.current !== controller) return;

      if (!response.ok) {
        const message = body.kind === "not_configured"
          ? "지금은 장소 검색을 사용할 수 없습니다. 직접 입력으로 일정을 추가해 주세요."
          : body.error ?? "장소를 검색하지 못했습니다.";
        if (previous) setPageError(message);
        else setSearch({
          status: "error",
          message,
          // 설정 누락은 사용자가 재시도해도 소용없다.
          retryable: body.kind !== "not_configured",
        });
        return;
      }

      const results = new Map<string, PlaceSearchResult>();
      for (const place of [...(previous?.results ?? []), ...body.results] as PlaceSearchResult[]) {
        results.set(`${place.provider}:${place.providerPlaceId}`, place);
      }
      setSearch({
        status: "done",
        results: [...results.values()],
        reachableCount: body.reachableCount,
        totalCount: body.totalCount,
        page,
        hasMore: Boolean(body.hasMore) && page < 3,
        notice: typeof body.notice === "string" ? body.notice : undefined,
      });
    } catch {
      if (requestRef.current !== controller) return;
      const message = controller.signal.aborted
        ? "검색 응답이 늦어지고 있습니다. 다시 검색하거나 직접 입력해 주세요."
        : "검색 요청이 실패했습니다. 네트워크를 확인하세요.";
      if (previous) setPageError(message);
      else setSearch({
        status: "error",
        message,
        retryable: true,
      });
    } finally {
      window.clearTimeout(timer);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoadingMore(false);
      }
    }
  }

  return (
    <section ref={sectionRef} className="min-w-0 scroll-mt-24 space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{selected ? "방문 시간 선택" : "장소 검색"}</h2>

      {!selected ? <>
      <form onSubmit={runSearch} className="space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => { cancelSearch(); setQuery(event.target.value); }}
            placeholder="이치란 라멘, 신주쿠 호텔…"
            aria-label="장소 검색어"
            maxLength={80}
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <button
            type="submit"
            disabled={search.status === "loading"}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
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
                onClick={() => { cancelSearch(); setCategory(active ? null : filter.code); }}
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
        <div className="flex items-center gap-3"><p role="status" className="text-sm text-muted-foreground">검색 중…</p><button type="button" onClick={cancelSearch} className="min-h-10 rounded-lg border border-border px-3 text-sm">검색 취소</button></div>
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

      {addState.status === "success" && addState.message ? (
        <p role="status" className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-primary">
          {addState.message}
        </p>
      ) : null}

      {search.status === "done" ? (
        search.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">검색 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {search.notice ? <p role="status" className="rounded-lg bg-muted px-3 py-2 text-xs">{search.notice}</p> : null}
            <p className="text-xs text-muted-foreground">
              {search.totalCount > search.reachableCount
                ? `${search.totalCount.toLocaleString()}건 중 ${search.reachableCount}건까지 볼 수 있습니다. 검색어를 좁히면 더 정확합니다.`
                : `${search.results.length}건`}
            </p>
            <ul className="space-y-2">
              {search.results.map((place) => (
                <li
                  key={`${place.provider}:${place.providerPlaceId}`}
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
                    onClick={() => {
                      if (onSelect) { onSelect(place); return; }
                      setSelected(place);
                      if (place.categoryGroup === "lodging") {
                        setStartLocal(defaultDate + "T15:00");
                        const tomorrow = new Date(defaultDate + "T12:00:00Z"); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
                        setEndLocal(tomorrow.toISOString().slice(0, 10) + "T11:00");
                      } else {
                        // 숙소를 고르며 바뀐 15:00 이 다음 장소에 남지 않게, 비숙소는 기본 시각으로 되돌린다.
                        setStartLocal(`${defaultDate}T${defaultTime}`);
                        setEndLocal("");
                      }
                      requestAnimationFrame(() => {
                        sectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                        sectionRef.current?.querySelector<HTMLInputElement>('input[type="datetime-local"]')?.focus({ preventScroll: true });
                      });
                    }}
                    className="shrink-0 rounded-full border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
                  >
                    선택
                  </button>
                </li>
              ))}
            </ul>
            {pageError ? <p role="alert" className="text-sm text-danger">{pageError}</p> : null}
            {search.hasMore ? <button type="button" disabled={loadingMore} onClick={() => void runSearch(undefined, search.page + 1)} className="min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">{loadingMore ? "더 불러오는 중…" : "검색 결과 더보기"}</button> : null}
          </div>
        )
      ) : null}

      </> : null}
      {selected ? (
        <form action={addAction} className="space-y-3 rounded-xl border border-foreground/40 bg-card px-3.5 py-3.5">
          <p className="text-sm">
            <span className="font-medium">{selected.name}</span> 을(를) 일정에 추가합니다.
          </p>

          <div className="space-y-1.5">
            <label htmlFor={startId} className="text-sm font-medium">
              {selected.categoryGroup === "lodging" ? "체크인" : "방문 시각"}
            </label>
            <input
              id={startId}
              type="datetime-local"
              onClick={openDatePicker}
              value={startLocal}
              onChange={(event) => setStartLocal(event.target.value)}
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
            />
            <p className="text-xs text-muted-foreground">현지 시간({timezone}) 기준입니다.</p>
          </div>

          {selected.categoryGroup === "lodging" && <label className="block space-y-1 text-sm"><span>체크아웃</span><input type="datetime-local" required value={endLocal} onChange={(e) => setEndLocal(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base" /></label>}
          <label className="block space-y-1 text-sm"><span>메모</span><textarea value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="예약번호, 준비물, 가는 길 안내…" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base" /></label>
          <input
            type="hidden"
            name="payload"
            value={JSON.stringify({ ...selected, tripId, startLocal, endLocal, note, pollId: pollId || null })}
          />

          {openPolls.length > 0 ? (
            <label className="block space-y-1 text-sm">
              <span className="font-medium">투표 후보로 넣기</span>
              <select value={pollId} onChange={(event) => setPollId(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                <option value="">투표 선택</option>
                {openPolls.map((poll) => <option key={poll.id} value={poll.id}>{poll.title}</option>)}
              </select>
            </label>
          ) : null}

          {addState.status === "error" && addState.message ? (
            <p role="alert" className="text-sm text-danger">
              {addState.message}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="intent"
              value="schedule"
              disabled={adding}
              className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {adding ? "추가 중…" : "일정에 추가"}
            </button>
            {openPolls.length > 0 ? (
              <button
                type="submit"
                name="intent"
                value="candidate"
                disabled={adding || !pollId}
                className="flex-1 rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary transition-opacity hover:bg-primary/10 disabled:opacity-50"
              >
                {adding ? "등록 중…" : "투표 후보로 등록"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              장소 다시 선택
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
