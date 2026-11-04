"use client";

import { useState } from "react";

import type { AirportHit } from "@/features/flights/airport-search";

const FIELD = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base";

type Props = { name: string; label: string; placeholder: string; errors?: string[] };

/**
 * 공항 코드 입력. 코드를 알면 바로 3글자를 쓰고, 모르면 도시·공항 이름으로 찾아 고른다.
 * 찾기는 보조일 뿐이라 실패해도 코드를 직접 쓰는 길은 그대로 열려 있다.
 */
export function AirportField({ name, label, placeholder, errors }: Props) {
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "done"; hits: AirportHit[] }
  >({ status: "idle" });
  const [picked, setPicked] = useState<AirportHit | null>(null);

  async function find() {
    const q = query.trim();
    if (q.length < 2) return;
    setState({ status: "loading" });
    try {
      const url = new URL("/api/airports/search", window.location.origin);
      url.searchParams.set("q", q);
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) {
        setState({ status: "error", message: body.error ?? "공항을 찾지 못했습니다." });
        return;
      }
      setState({ status: "done", hits: body.airports ?? [] });
    } catch {
      setState({ status: "error", message: "검색 요청이 실패했습니다. 코드를 직접 입력해도 됩니다." });
    }
  }

  return (
    <div className="space-y-1 text-sm">
      <label className="block space-y-1">
        <span className="font-medium">{label}</span>
        <input
          name={name}
          required
          maxLength={3}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setPicked(null);
          }}
          placeholder={placeholder}
          className={`${FIELD} uppercase`}
        />
      </label>
      {errors?.length ? <p role="alert" className="text-sm text-danger">{errors[0]}</p> : null}
      {picked ? <p className="text-xs text-muted-foreground">{picked.name} · 현지 시간대 {picked.timezone}</p> : null}
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void find();
            }
          }}
          placeholder="코드를 모르면 도시·공항 이름 (예: 타이베이)"
          aria-label={`${label} 이름으로 찾기`}
          className={FIELD}
        />
        <button
          type="button"
          onClick={() => void find()}
          disabled={state.status === "loading"}
          className="shrink-0 rounded-full border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {state.status === "loading" ? "찾는 중…" : "찾기"}
        </button>
      </div>
      {state.status === "error" ? <p role="alert" className="text-xs text-danger">{state.message}</p> : null}
      {state.status === "done" ? (
        state.hits.length === 0 ? (
          <p className="text-xs text-muted-foreground">공항을 찾지 못했어요. 코드를 직접 입력해 주세요.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {state.hits.map((hit) => (
              <li key={hit.iata}>
                <button
                  type="button"
                  onClick={() => {
                    setCode(hit.iata);
                    setPicked(hit);
                    setState({ status: "idle" });
                  }}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                >
                  <span className="min-w-0 truncate">{hit.name}<span className="text-muted-foreground"> · {hit.place}</span></span>
                  <span className="shrink-0 font-semibold">{hit.iata}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
