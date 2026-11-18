"use client";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { managePackingItem } from "./actions";
import { PACKING_CATEGORIES, groupByCategory, progress, type PackingItem } from "./model";

const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base";
type Props = { tripId: string; items: PackingItem[]; editable: boolean };

export function PackingList({ tripId, items, editable }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [refreshing, refresh] = useTransition();
  const busy = saving || refreshing;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  const stats = progress(items);
  const categories = [...new Set([...PACKING_CATEGORIES, ...items.map(item => item.category)])];

  async function run(input: Parameters<typeof managePackingItem>[0]): Promise<boolean> {
    if (busy) return false;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await managePackingItem(input);
      if (!result.ok) { setError(result.message); return false; }
      setMessage(result.message); setDeleting(null);
      refresh(() => router.refresh());
      return true;
    } catch { setError("서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."); return false; }
    finally { setSaving(false); }
  }
  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, data = new FormData(form);
    const ok = await run({ tripId, action: "save", id: null, expected: null, data: { title: data.get("title"), category: data.get("category"), checked: false } });
    if (ok) { const title = form.elements.namedItem("title") as HTMLInputElement | null; if (title) { title.value = ""; title.focus(); } }
  }
  const toggle = (item: PackingItem) => run({ tripId, action: "save", id: item.id, expected: item.updated_at, data: { title: item.title, category: item.category, checked: !item.checked } });
  const groups = groupByCategory(hideDone ? items.filter(item => !item.checked) : items);

  return <section className="space-y-7" aria-label="여행 준비물">
    <div className="rounded-xl border border-border p-5">
      <h2 className="text-lg font-semibold">준비 현황</h2>
      <p className="mt-2 text-2xl font-semibold tabular-nums" data-testid="packing-progress">{items.length ? `${stats.done} / ${stats.total}` : "아직 준비물이 없어요"}</p>
      {items.length > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percent} aria-label="준비물 완료율"><div className="h-full bg-foreground transition-[width]" style={{ width: `${stats.percent}%` }} /></div>}
      {items.length > 0 && stats.done === stats.total && <p className="mt-3 text-sm">모두 챙겼어요. 즐거운 여행 되세요!</p>}
    </div>
    {editable && <form onSubmit={onAdd} className="rounded-xl border border-border p-5">
      <h2 className="mb-4 text-lg font-semibold">준비물 추가</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="text-sm">준비물<input required name="title" autoComplete="off" maxLength={100} placeholder="예: 보조배터리" className={inputClass} /></label>
        <label className="text-sm">분류<input required name="category" list="packing-categories" maxLength={30} defaultValue="기타" className={inputClass} /></label>
        <datalist id="packing-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        <button type="submit" className="min-h-11 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background">{busy ? "저장 중…" : "추가"}</button>
      </fieldset>
      <div className="mt-4 text-sm"><button type="button" disabled={busy} onClick={() => void run({ tripId, action: "template", id: null, expected: null, data: {} })} className="min-h-11 py-2 underline">대만 여행 기본 준비물 추가</button><span className="ml-2 text-xs text-muted-foreground">이미 있는 항목은 건너뜁니다.</span></div>
    </form>}
    {!editable && <p className="text-sm text-muted-foreground">읽기 전용입니다. 준비물 추가·체크는 소유자와 편집자만 할 수 있습니다.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {items.length > 0 && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} className="size-5" />챙긴 항목 숨기기</label>}
    {groups.map(([name, rows]) => <section key={name} aria-label={`${name} 준비물`}>
      <h2 className="mb-1 text-sm font-semibold text-muted-foreground">{name} <span className="tabular-nums">({rows.filter(r => r.checked).length}/{rows.length})</span></h2>
      <ul className="divide-y divide-border">{rows.map(item => <li key={item.id} className="flex items-center gap-3 py-1" data-testid="packing-row">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
          <input type="checkbox" checked={item.checked} disabled={!editable || busy} onChange={() => void toggle(item)} className="size-5 shrink-0" />
          <span className={`min-w-0 break-words ${item.checked ? "text-muted-foreground line-through" : ""}`}>{item.title}</span>
        </label>
        {editable && (deleting === item.id
          ? <div className="flex shrink-0 items-center gap-3 text-sm" role="group" aria-label="준비물 삭제 확인"><button disabled={busy} type="button" className="min-h-11 text-red-600" onClick={() => void run({ tripId, action: "delete", id: item.id, expected: item.updated_at, data: {} })}>삭제 확인</button><button disabled={busy} type="button" className="min-h-11" onClick={() => setDeleting(null)}>취소</button></div>
          : <button disabled={busy} type="button" className="min-h-11 shrink-0 px-2 text-sm text-muted-foreground" aria-label={`${item.title} 삭제`} onClick={() => setDeleting(item.id)}>삭제</button>)}
      </li>)}</ul>
    </section>)}
    {items.length > 0 && !groups.length && <p className="text-sm text-muted-foreground">모든 준비물을 챙겼어요.</p>}
  </section>;
}
