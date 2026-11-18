"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { manageExpense } from "./actions";
import { CATEGORIES, CURRENCIES, formatAmount, fractionDigits, parseAmount, totals, type Expense } from "./model";
import { clearDraft, draftKey, readDraft, writeDraft, type ExpenseFields } from "./draft";
import { CategoryManager } from "./category-manager";

type Props = { tripId: string; draftOwner?: string; expenses: Expense[]; editable: boolean; currency: string; defaultDate: string };
const inputClass = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base";
function Amounts({ rows }: { rows: Expense[] }) {
  return <>{totals(rows).map(([currency, amount]) => <span key={currency} className="block tabular-nums">{formatAmount(amount, currency)}</span>)}</>;
}
export function ExpenseBook({ tripId, draftOwner, expenses, editable, currency, defaultDate }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [refreshing, refresh] = useTransition();
  const busy = saving || refreshing;
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [showForm, setShowForm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState<ExpenseFields | null>(null);
  const [draftNotice, setDraftNotice] = useState("");
  const storageKey = draftOwner ? draftKey(draftOwner, tripId) : null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function rememberForm() {
    if (!formRef.current) return;
    const values = Object.fromEntries(new FormData(formRef.current)) as ExpenseFields;
    setDirty(true);
    setDraftNotice(writeDraft(storageKey, values, editing) ? "현재 탭에 임시 저장됨 · 저장 버튼을 눌러 여행에 반영하세요." : "임시 저장을 사용할 수 없습니다. 화면을 떠나기 전에 저장해 주세요.");
  }
  function openEditor(row: Expense | null = null) {
    if (busy) return;
    const draft = readDraft(storageKey);
    if (row && dirty && editing?.id === row.id) { setShowForm(true); return; }
    if (row && (dirty || draft) && (editing?.id ?? draft?.row?.id) !== row.id && !window.confirm("작성 중인 지출을 버리고 다른 지출을 수정할까요?")) return;
    if (!row && dirty) { setShowForm(true); return; }
    if (draft && (!row || draft.row?.id === row.id)) {
      setEditing(draft.row); setFields(draft.fields); setDirty(true);
      setDraftNotice("작성하던 내용을 복원했습니다. 저장 버튼을 눌러 반영하세요.");
    } else {
      if (row) { clearDraft(storageKey); setFields(null); }
      setEditing(row); setDirty(false); setDraftNotice("");
    }
    setError(""); setMessage(""); setShowForm(true); setRevision(n => n + 1);
  }
  const categories = [...new Set([...CATEGORIES, ...expenses.map(e => e.category)])];
  const visible = expenses.filter(e => (!category || e.category === category) && (!date || e.spent_on === date));
  async function submit(action: "save" | "delete", row: Expense | null, data: unknown) {
    if (busy) return;
    const savedFields = action === "save" && formRef.current ? Object.fromEntries(new FormData(formRef.current)) as ExpenseFields : null;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await manageExpense({ tripId, action, id: row?.id ?? null, expected: row?.updated_at ?? null, data });
      if (!result.ok) { setError(result.message); return; }
      setMessage(result.message); setDeleting(null);
      if (action === "save" || editing?.id === row?.id) {
        if (savedFields) {
          setFields({ ...savedFields, title: "", amount: "", note: "" });
        } else setFields(null);
        clearDraft(storageKey); setEditing(null); setDirty(false); setDraftNotice("");
        setShowForm(false); setRevision(n => n + 1);
      }
      refresh(() => router.refresh());
    } catch { setError("서버에 연결하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  }
  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currency = String(form.get("currency"));
    const amount = parseAmount(String(form.get("amount")), currency);
    if (amount === null) { setError(`${currency} 금액은 0보다 큰 숫자로 입력하세요. 소수점은 ${fractionDigits(currency)}자리까지 가능합니다.`); return; }
    void submit("save", editing, { title: form.get("title"), category: form.get("category"), spent_on: form.get("spent_on"), currency, amount_minor: amount, note: form.get("note") });
  }
  return <section className="space-y-7" aria-label="여행 지출 정리">
    <div className="rounded-xl border border-border p-5">
      <h2 className="text-lg font-semibold">총 사용 금액</h2>
      <div className="mt-2 text-2xl font-semibold" data-testid="expense-total">{expenses.length ? <Amounts rows={expenses} /> : "아직 기록한 지출이 없어요"}</div>
      <p className="mt-2 text-xs text-muted-foreground">{expenses.length}건 · 통화별 합계이며 환율을 적용하지 않습니다.</p>
    </div>
    {expenses.length > 0 && <section aria-label="카테고리별 합계" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {categories.filter(c => expenses.some(e => e.category === c)).map(c => <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)} className={`min-w-0 rounded-xl border p-4 text-left ${category === c ? "border-foreground bg-muted" : "border-border"}`}>
        <span className="block break-words text-sm text-muted-foreground">{c}</span><span className="mt-1 block break-words font-semibold"><Amounts rows={expenses.filter(e => e.category === c)} /></span>
      </button>)}
    </section>}
    {editable && <button type="button" disabled={busy} onClick={() => openEditor()} className="min-h-11 rounded-lg bg-foreground px-5 py-3 font-semibold text-background">{dirty ? "작성 중인 지출 이어쓰기" : "지출 추가 / 이어쓰기"}</button>}
    {editable && showForm ? <form ref={formRef} key={`${editing?.id ?? "new"}-${revision}`} onChange={rememberForm} onSubmit={onSave} className="rounded-xl border border-border p-5">
      <h2 className="mb-4 text-lg font-semibold">{editing ? "지출 수정" : "지출 추가"}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">지출명<input autoComplete="off" required name="title" maxLength={100} defaultValue={fields?.title ?? editing?.title ?? ""} placeholder="예: 딘타이펑 점심" className={inputClass} /></label>
        <label className="text-sm">사용 날짜<input required type="date" name="spent_on" defaultValue={fields?.spent_on ?? editing?.spent_on ?? defaultDate} className={inputClass} /></label>
        <label className="text-sm">금액<input required inputMode="decimal" name="amount" maxLength={40} defaultValue={fields?.amount ?? (editing ? String(editing.amount_minor / 10 ** fractionDigits(editing.currency)) : "")} placeholder="예: 850" className={inputClass} /></label>
        <label className="text-sm">통화<select name="currency" defaultValue={fields?.currency ?? editing?.currency ?? (CURRENCIES.includes(currency as typeof CURRENCIES[number]) ? currency : "KRW")} className={inputClass}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="text-sm">카테고리<input required name="category" list="expense-categories" maxLength={30} defaultValue={fields?.category ?? editing?.category ?? "식비"} className={inputClass} /><span className="mt-1 block text-xs text-muted-foreground">기본 분류를 선택하거나 직접 입력하세요.</span></label>
        <datalist id="expense-categories">{categories.map(c => <option key={c} value={c} />)}</datalist>
        <label className="text-sm">메모 (선택)<input name="note" maxLength={1000} defaultValue={fields?.note ?? editing?.note ?? ""} placeholder="예: 2명 식사, 카드 결제" className={inputClass} /></label>
        {draftNotice && <p className="text-xs text-muted-foreground sm:col-span-2" role="status">{draftNotice}</p>}
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background" type="submit">{busy ? "저장 중…" : editing ? "변경 저장" : "지출 저장"}</button><button type="button" onClick={() => { if (formRef.current) setFields(Object.fromEntries(new FormData(formRef.current)) as ExpenseFields); setShowForm(false); }} className="px-3 py-3 text-sm">접기</button><button type="button" onClick={() => { if (dirty && !window.confirm("작성 중인 내용을 버릴까요?")) return; clearDraft(storageKey); setEditing(null); setFields(null); setDirty(false); setShowForm(false); setError(""); }} className="px-3 py-3 text-sm">작성 취소</button></div>
      </fieldset>
    </form> : !editable && <p className="text-sm text-muted-foreground">읽기 전용입니다. 지출 추가·수정은 소유자와 편집자만 할 수 있습니다.</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {editable && <CategoryManager tripId={tripId} expenses={expenses} disabled={busy || dirty} onChanged={(from, to) => { if (category === from) setCategory(to); if (fields?.category === from) setFields({ ...fields, category: to }); refresh(() => router.refresh()); }} />}
    <section aria-label="지출 내역" className="space-y-4">
      <h2 className="text-lg font-semibold">지출 내역</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 text-sm">카테고리 필터<select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}><option value="">전체 카테고리</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label className="min-w-0 text-sm">날짜 필터<input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} /></label>
        {(category || date) && <button type="button" className="px-2 py-3 text-sm underline" onClick={() => { setCategory(""); setDate(""); }}>필터 초기화</button>}
      </div>
      {(category || date) && <div className="text-sm" role="status">선택한 내역 {visible.length}건 합계 <Amounts rows={visible} /></div>}
      {!visible.length && <p className="py-5 text-sm text-muted-foreground">{expenses.length ? "선택한 조건에 맞는 지출이 없습니다." : "쓴 금액을 하나씩 기록해 여행 경비를 정리해 보세요."}</p>}
      <ul className="divide-y divide-border">{visible.map(row => <li key={row.id} className="py-4" data-testid="expense-row">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-medium">{row.title}</p><p className="mt-1 break-words text-xs text-muted-foreground">{row.spent_on} · {row.category}</p>{row.note && <p className="mt-2 break-words text-sm text-muted-foreground">{row.note}</p>}</div><p className="shrink-0 text-sm font-semibold tabular-nums">{formatAmount(row.amount_minor, row.currency)}</p></div>
        {editable && <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <button disabled={busy} type="button" className="py-2 underline" aria-label={`${row.title} 수정`} onClick={() => { openEditor(row); requestAnimationFrame(() => { formRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); formRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus({ preventScroll: true }); }); }}>수정</button>
          <button disabled={busy} type="button" className="py-2 text-muted-foreground" aria-label={`${row.title} 삭제`} onClick={() => setDeleting(row.id)}>삭제</button>
          {deleting === row.id && <div className="flex flex-wrap items-center gap-3" role="group" aria-label="지출 삭제 확인"><span>이 지출을 삭제할까요?</span><button disabled={busy} type="button" className="py-2 text-red-600" onClick={() => void submit("delete", row, {})}>삭제 확인</button><button disabled={busy} type="button" onClick={() => setDeleting(null)}>취소</button></div>}
        </div>}
      </li>)}</ul>
    </section>
  </section>;
}
