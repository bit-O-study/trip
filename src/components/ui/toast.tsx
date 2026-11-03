"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * 화면 아래에 잠깐 떴다 사라지는 알림. 실행 취소 같은 되돌리기 동작을 함께 둘 수 있다.
 *
 * window.confirm 은 모바일 브라우저가 막거나 억제하고, 확인을 한 번 더 누르게 해
 * 흐름을 끊는다. 지우기·이동처럼 되돌릴 수 있는 동작은 먼저 실행하고
 * 이 알림에서 "되돌리기" 를 주는 쪽이 빠르고 안전하다.
 */
export type ToastInput = {
  message: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  /** 밀리초. 기본 7초. */
  duration?: number;
  tone?: "default" | "error";
};

type ToastState = ToastInput & { id: number };

type ToastApi = { show: (toast: ToastInput) => void; dismiss: () => void };

/** Provider 밖(단위 테스트 등)에서는 아무것도 하지 않는다. */
const NOOP: ToastApi = { show: () => {}, dismiss: () => {} };
const ToastContext = createContext<ToastApi>(NOOP);

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(() => setToast(null), []);
  const show = useCallback((input: ToastInput) => {
    counter.current += 1;
    setBusy(false);
    setToast({ ...input, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), toast.duration ?? 7000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-8"
        >
          <div
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-full px-5 py-3 text-sm shadow-[var(--shadow-lift)] ${
              toast.tone === "error" ? "bg-danger text-white" : "bg-foreground text-background"
            }`}
          >
            <span className="min-w-0 break-words">{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await toast.onAction?.();
                  } finally {
                    setToast((current) => (current?.id === toast.id ? null : current));
                  }
                }}
                className="shrink-0 font-semibold underline underline-offset-4 disabled:opacity-60"
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
