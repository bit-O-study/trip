import { z } from "zod";
import { expenseSchema, type Expense } from "./model";

const fields = z.object({
  title: z.string().max(100), spent_on: z.string().max(10), amount: z.string().max(40),
  currency: z.string().max(3), category: z.string().max(30), note: z.string().max(1000),
});
export type ExpenseFields = z.infer<typeof fields>;
const draftSchema = z.object({
  fields, row: expenseSchema.extend({ id: z.string(), updated_at: z.string() }).nullable(),
  savedAt: z.number(),
});
export type ExpenseDraft = z.infer<typeof draftSchema>;
export function draftKey(owner: string, tripId: string) { return `trip:expense-draft:${owner}:${tripId}`; }
export function readDraft(key: string | null): ExpenseDraft | null {
  if (!key) return null;
  try {
    const parsed = draftSchema.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    if (parsed.success && Date.now() - parsed.data.savedAt < 86_400_000) return parsed.data;
    sessionStorage.removeItem(key);
  } catch { /* Storage can be unavailable; the in-memory form remains usable. */ }
  return null;
}
export function writeDraft(key: string | null, fields: ExpenseFields, row: Expense | null): boolean {
  if (!key) return false;
  try { sessionStorage.setItem(key, JSON.stringify({ fields, row, savedAt: Date.now() })); return true; }
  catch { return false; }
}
export function clearDraft(key: string | null) {
  if (key) try { sessionStorage.removeItem(key); } catch { /* Best effort. */ }
}
