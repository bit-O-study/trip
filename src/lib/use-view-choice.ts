"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const EVENT = "trip-view-choice";
const MAX_AGE = 24 * 60 * 60 * 1000;
export function viewChoiceKey(userId: string | undefined, tripId: string, field: string) {
  return userId ? `trip:view:v1:${userId}:${tripId}:${field}` : undefined;
}
function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}
const serverSnapshot = () => null;

/** 화면 선택만 현재 탭에 보관한다. 저장소를 막은 브라우저에서도 조작은 유지한다. */
export function useViewChoice(key: string | undefined, fallback: string, valid: (value: string) => boolean = () => true): [string, (value: string) => void] {
  const [local, setLocal] = useState<{ key: string | undefined; value: string; failed: boolean } | null>(null);
  const snapshot = useCallback(() => {
    try {
      const raw = key ? sessionStorage.getItem(key) : null;
      if (raw === null) return null;
      const saved = JSON.parse(raw), now = Date.now();
      return typeof saved.value === "string" && typeof saved.at === "number" && saved.at <= now && now - saved.at < MAX_AGE ? saved.value as string : null;
    } catch { return null; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const memory = local && local.key === key ? local : null;
  let value = memory ? memory.value : fallback;
  if (raw !== null && !memory?.failed) value = raw;
  function update(next: string) {
    let failed = false;
    try { if (key) sessionStorage.setItem(key, JSON.stringify({ value: next, at: Date.now() })); } catch { failed = true; }
    setLocal({ key, value: next, failed });
    window.dispatchEvent(new Event(EVENT));
  }
  return [valid(value) ? value : fallback, update];
}
