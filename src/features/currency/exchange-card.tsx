"use client";

import { useState } from "react";

type Props = {
  /** 여행 통화(예: TWD) */
  currency: string;
  /** 환산 대상(보통 KRW) */
  target: string;
  /** 1 currency 가 몇 target 인가 */
  rate: number;
  /** 공급자가 환율을 갱신한 시각(ISO) */
  updatedAt: string;
};

const nf = (value: number, digits = 2) =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/**
 * 오늘의 참고 환율과 간단한 계산기. 금액을 입력하면 두 방향으로 바로 환산한다.
 * 저장하지 않는 참고용이다(정산 기준 환율이 아니다).
 */
export function ExchangeCard({ currency, target, rate, updatedAt }: Props) {
  const [amount, setAmount] = useState("");
  const [reverse, setReverse] = useState(false);

  const parsed = Number(amount.replace(/,/g, ""));
  const valid = amount.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const result = valid ? (reverse ? parsed / rate : parsed * rate) : null;
  const from = reverse ? target : currency;
  const to = reverse ? currency : target;
  const updated = new Date(updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" });

  return (
    <section aria-label="환율" className="rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-base font-semibold tracking-tight">
          1 {currency} <span className="text-muted-foreground">≈</span> {nf(rate, rate >= 100 ? 1 : 2)} {target}
        </p>
        <p className="text-xs text-muted-foreground">오늘 아침 기준 · {updated} 갱신</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="fx-amount">{from} 금액</label>
        <input
          id="fx-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={`${from} 금액`}
          className="w-36 rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <button
          type="button"
          onClick={() => setReverse((value) => !value)}
          aria-label={`${from}에서 ${to}로 환산 중. 방향 바꾸기`}
          className="rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          {from} → {to}
        </button>
        <p role="status" className="font-mono text-base font-semibold">
          {result === null ? "" : `${nf(result, reverse ? 2 : 0)} ${to}`}
        </p>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        참고용 환율입니다. 실제 결제·환전 금액과 다를 수 있어요.{" "}
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Rates By Exchange Rate API</a>
      </p>
    </section>
  );
}
