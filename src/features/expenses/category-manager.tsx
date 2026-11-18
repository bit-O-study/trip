"use client";
import { useState, type FormEvent } from "react";
import { renameExpenseCategory } from "./actions";
import type { Expense } from "./model";

export function CategoryManager({ tripId, expenses, disabled, onChanged }: {
  tripId: string; expenses: Expense[]; disabled: boolean; onChanged: (from: string, to: string) => void;
}) {
  const categories = [...new Set(expenses.map(row => row.category))].sort((a, b) => a.localeCompare(b, "ko"));
  const [source, setSource] = useState("");
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const from = categories.includes(source) ? source : categories[0] ?? "";
  const to = target.trim();
  const rows = expenses.filter(row => row.category === from);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || disabled || !to || to === from) return;
    setSaving(true); setFeedback(null);
    try {
      const result = await renameExpenseCategory({ tripId, from, to, expected: rows.map(({ id, updated_at }) => ({ id, updated_at })) });
      setFeedback(result);
      if (result.ok) { setSource(to); setTarget(""); onChanged(from, to); }
    } catch { setFeedback({ ok: false, message: "연결하지 못했습니다. 변경할 이름을 유지했으니 다시 시도해 주세요." }); }
    finally { setSaving(false); }
  }
  if (!categories.length) return null;
  return <details className="rounded-xl border border-border p-4">
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">사용한 카테고리 정리</summary>
    <p className="mb-3 text-sm text-muted-foreground">이름을 바꾸거나 기존 카테고리로 합칠 수 있습니다. 지출 금액과 내역은 유지됩니다.</p>
    {disabled && <p className="mb-3 text-sm text-muted-foreground">작성 중인 지출을 저장하거나 취소한 뒤 분류를 정리해 주세요.</p>}
    <form onSubmit={submit}>
      <fieldset disabled={saving || disabled} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">변경할 카테고리<select aria-label="변경할 카테고리" value={from} onChange={event => { setSource(event.target.value); setFeedback(null); }} className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3">{categories.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm">새 이름 또는 합칠 카테고리<input required maxLength={30} value={target} onChange={event => { setTarget(event.target.value); setFeedback(null); }} list="used-expense-categories" className="mt-1 min-h-11 w-full rounded-lg border border-border bg-background px-3" /></label>
        <datalist id="used-expense-categories">{categories.filter(value => value !== from).map(value => <option key={value}>{value}</option>)}</datalist>
        {to && to !== from && <p className="text-sm sm:col-span-2">‘{from}’ {rows.length}건 → ‘{to}’{categories.includes(to) ? "에 합칩니다." : "로 이름을 바꿉니다."}</p>}
        <button disabled={!to || to === from} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50">{saving ? "변경 중…" : `${rows.length}건 분류 변경`}</button>
      </fieldset>
    </form>
    {feedback && <p className="mt-3 text-sm" role={feedback.ok ? "status" : "alert"}>{feedback.message}</p>}
  </details>;
}
