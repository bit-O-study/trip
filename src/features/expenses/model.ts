import { z } from "zod";

export const CATEGORIES = ["식비", "교통", "숙박", "쇼핑", "관광", "기타"];
export const CURRENCIES = ["KRW", "TWD", "USD", "JPY", "EUR", "CNY", "VND", "THB", "SGD", "HKD", "GBP", "AUD"] as const;
export function fractionDigits(currency: string) { return ["KRW", "JPY", "VND"].includes(currency) ? 0 : 2; }
export function parseAmount(value: string, currency: string): number | null {
  const digits = fractionDigits(currency);
  const trimmed = value.trim();
  if (trimmed.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const normalized = trimmed.replaceAll(",", "");
  if (!new RegExp(`^\\d{1,11}${digits ? '(?:\\.\\d{1,2})?' : ''}$`).test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const amount = Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 99999999999 ? amount : null;
}
export function formatAmount(amount: number, currency: string) {
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: fractionDigits(currency) }).format(amount / 10 ** fractionDigits(currency))} ${currency}`;
}
export const expenseSchema = z.object({
  title: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(30),
  spent_on: z.iso.date(), currency: z.enum(CURRENCIES), amount_minor: z.number().int().min(1).max(99999999999),
  note: z.string().trim().max(1000),
});
export type Expense = z.infer<typeof expenseSchema> & { id: string; updated_at: string };
export function totals(rows: Expense[]): Array<[string, number]> {
  const result = new Map<string, number>();
  for (const row of rows) result.set(row.currency, (result.get(row.currency) ?? 0) + row.amount_minor);
  return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
}
