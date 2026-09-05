"use client";

import { useActionState, useState, type FormEvent } from "react";

import { addFlightToTripAction, addManualFlightAction } from "@/features/flights/actions";
import type { FlightSearchResult } from "@/features/flights/provider";
import { IDLE, type ActionState } from "@/features/trips/action-state";
import { openDatePicker } from "@/lib/date-picker";

type Props = { tripId: string; defaultDate: string; timezone: string };

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retryable: boolean }
  | { status: "done"; results: FlightSearchResult[]; flightNumberInput: string };

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 text-base";

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p role="alert" className="text-sm text-danger">{errors[0]}</p>;
}

function localLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: timezone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * 항공편 추가.
 *
 * **수동 입력 폼은 언제나 화면에 있다.** 검색은 편의지 필수 경로가 아니라서,
 * 공급자가 하나도 설정되지 않았거나 편명을 못 찾아도 사용자는 여기서 일정을
 * 만들 수 있어야 한다 (docs/architecture.md §1). 검색 실패를 막다른 길로
 * 만들지 않는 것이 이 컴포넌트의 요점이다.
 */
export function FlightAdd({ tripId, defaultDate, timezone }: Props) {
  const [flightNumber, setFlightNumber] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [search, setSearch] = useState<SearchState>({ status: "idle" });
  const [selected, setSelected] = useState<FlightSearchResult | null>(null);

  const [addState, addAction, adding] = useActionState<ActionState, FormData>(
    addFlightToTripAction,
    IDLE,
  );
  const [manualState, manualAction, savingManual] = useActionState<ActionState, FormData>(
    addManualFlightAction,
    IDLE,
  );
  const manualErrors = manualState.fieldErrors ?? {};

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = flightNumber.trim();
    if (!trimmed) return;

    setSearch({ status: "loading" });
    setSelected(null);
    try {
      const url = new URL("/api/flights/search", window.location.origin);
      url.searchParams.set("flightNumber", trimmed);
      url.searchParams.set("date", date);
      const response = await fetch(url);
      const body = await response.json();

      if (!response.ok) {
        setSearch({
          status: "error",
          message: body.error ?? "항공편을 찾지 못했습니다.",
          // 설정 누락은 재시도해도 소용없다.
          retryable: body.kind !== "not_configured",
        });
        return;
      }
      setSearch({
        status: "done",
        results: body.results ?? [],
        flightNumberInput: body.flightNumberInput ?? trimmed,
      });
    } catch {
      setSearch({ status: "error", message: "조회 요청이 실패했습니다.", retryable: true });
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-base font-semibold">항공편 추가</h2>

      <form onSubmit={runSearch} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="space-y-1 text-sm">
          <span className="font-medium">편명</span>
          <input
            value={flightNumber}
            onChange={(event) => setFlightNumber(event.target.value)}
            placeholder="KE703"
            maxLength={12}
            className={FIELD}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">출발일</span>
          <input
            type="date"
            value={date}
            onClick={openDatePicker}
            onChange={(event) => setDate(event.target.value)}
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={search.status === "loading"}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {search.status === "loading" ? "찾는 중…" : "항공편 찾기"}
        </button>
      </form>

      {search.status === "error" ? (
        <div role="alert" className="space-y-1 rounded-lg border border-border px-3 py-3">
          <p className="text-sm text-danger">{search.message}</p>
          <p className="text-sm text-muted-foreground">
            {search.retryable
              ? "잠시 후 다시 시도하거나, 아래에서 직접 입력하세요."
              : "아래에서 직접 입력할 수 있습니다."}
          </p>
        </div>
      ) : null}

      {search.status === "done" ? (
        search.results.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            해당 날짜의 운항편을 찾지 못했습니다. 아래에서 직접 입력하세요.
          </p>
        ) : (
          <ul className="space-y-2">
            {search.results.map((flight, index) => (
              <li
                key={`${flight.marketingFlightNumber}-${index}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {flight.marketingFlightNumber}
                    {flight.airlineName ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {flight.airlineName}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {flight.departure.airport} {localLabel(flight.departure.scheduledAt, flight.departure.timezone)}
                    {" → "}
                    {flight.arrival.airport} {localLabel(flight.arrival.scheduledAt, flight.arrival.timezone)}
                  </p>
                  {/* 각 시각은 그 공항의 현지 시각이다. 밝히지 않으면 시차 노선에서 오해가 생긴다. */}
                  <p className="text-xs text-muted-foreground">각 공항 현지 시각</p>
                  {flight.operatingFlightNumber ? (
                    <p className="text-xs text-muted-foreground">
                      코드셰어 · 운항 {flight.operatingFlightNumber}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(flight)}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  선택
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {selected ? (
        <form action={addAction} className="space-y-2 rounded-lg border border-primary px-3 py-3">
          <p className="text-sm">
            <span className="font-medium">{selected.marketingFlightNumber}</span> 을(를) 일정에
            추가합니다.
          </p>
          <input type="hidden" name="tripId" value={tripId} />
          <input
            type="hidden"
            name="flightNumberInput"
            value={search.status === "done" ? search.flightNumberInput : selected.marketingFlightNumber}
          />
          {/* raw 는 공급자 원문이라 크고 저장 경로에서 쓰지 않는다. 보내지 않는다. */}
          <input
            type="hidden"
            name="payload"
            value={JSON.stringify({ ...selected, raw: undefined })}
          />
          {addState.status === "error" && addState.message ? (
            <p role="alert" className="text-sm text-danger">{addState.message}</p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={adding}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {adding ? "추가 중…" : "일정에 추가"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              취소
            </button>
          </div>
        </form>
      ) : null}

      {addState.status === "success" && addState.message ? (
        <p role="status" className="text-sm text-primary">{addState.message}</p>
      ) : null}

      <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          직접 입력 (검색 없이도 언제나 가능)
        </summary>
        <form action={manualAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="tripId" value={tripId} />
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">편명</span>
            <input name="flightNumber" required maxLength={12} placeholder="KE703" className={FIELD} />
            <FieldError errors={manualErrors.flightNumber} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">출발 공항</span>
            <input name="departureAirport" required maxLength={3} placeholder="ICN" className={`${FIELD} uppercase`} />
            <FieldError errors={manualErrors.departureAirport} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">도착 공항</span>
            <input name="arrivalAirport" required maxLength={3} placeholder="NRT" className={`${FIELD} uppercase`} />
            <FieldError errors={manualErrors.arrivalAirport} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">출발 (현지 시각)</span>
            <input
              type="datetime-local"
              name="departureLocal"
              onClick={openDatePicker}
              required
              defaultValue={`${defaultDate}T09:00`}
              className={FIELD}
            />
            <FieldError errors={manualErrors.departureLocal} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">도착 (현지 시각)</span>
            <input
              type="datetime-local"
              name="arrivalLocal"
              onClick={openDatePicker}
              required
              defaultValue={`${defaultDate}T11:30`}
              className={FIELD}
            />
            <FieldError errors={manualErrors.arrivalLocal} />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            각 시각은 <strong>그 공항의 현지 시각</strong>으로 입력하세요. 공항 시간대를 모르는
            코드는 이 여행의 시간대({timezone})로 저장합니다. 날짜변경선을 넘어 도착일이
            출발일보다 이르거나 이틀 뒤여도 그대로 저장됩니다.
          </p>
          {manualState.status === "error" && manualState.message ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">{manualState.message}</p>
          ) : null}
          {manualState.status === "success" && manualState.message ? (
            <p role="status" className="text-sm text-primary sm:col-span-2">{manualState.message}</p>
          ) : null}
          <button
            type="submit"
            disabled={savingManual}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50 sm:col-span-2"
          >
            {savingManual ? "추가 중…" : "직접 입력한 항공편 추가"}
          </button>
        </form>
      </details>
    </section>
  );
}
