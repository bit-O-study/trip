"use client";

import { useActionState, useState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { softDeleteTripFormAction } from "@/features/trips/actions";

/**
 * 여행 삭제. 누르면 바로 지우지 않고 한 번 더 확인한다(window.confirm 대신 화면 안에서).
 * 삭제하면 휴지통에서 복구할 수 있다. 실패하면 이유를 이 자리에 보여 준다.
 */
export function DeleteTripForm({ tripId }: { tripId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(softDeleteTripFormAction, IDLE);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-danger px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-primary-foreground"
      >
        여행 삭제
      </button>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-xl border border-danger/50 bg-card p-4">
      <input type="hidden" name="tripId" value={tripId} />
      <p className="text-sm font-medium">이 여행을 휴지통으로 옮길까요? 일정과 참여자는 그대로 두고, 휴지통에서 복구할 수 있어요.</p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? "옮기는 중…" : "휴지통으로 옮기기"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded-full border border-border px-4 py-2 text-sm font-medium">
          취소
        </button>
      </div>
      {state.status === "error" ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
    </form>
  );
}
