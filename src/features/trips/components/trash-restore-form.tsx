"use client";

import { useActionState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { restoreTripFormAction } from "@/features/trips/actions";

/** 휴지통의 복구 버튼. 권한이 없거나 이미 복구된 경우에도 전체 오류 화면 대신 이 자리에 이유를 보여 준다. */
export function TrashRestoreForm({ tripId, title }: { tripId: string; title: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(restoreTripFormAction, IDLE);
  return (
    <form action={action} className="shrink-0 text-right">
      <input type="hidden" name="tripId" value={tripId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${title} 복구`}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        {pending ? "복구 중…" : "복구"}
      </button>
      {state.status === "error" ? <p role="alert" className="mt-1 max-w-48 text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}
