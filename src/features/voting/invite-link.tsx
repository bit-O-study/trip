"use client";

import { useActionState } from "react";

import { createVoteInviteAction } from "@/features/voting/actions";
import { INVITE_IDLE } from "@/features/voting/types";

export function InviteLink({ tripId }: { tripId: string }) {
  const [state, action, pending] = useActionState(createVoteInviteAction, INVITE_IDLE);
  const url = state.invitePath;

  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="tripId" value={tripId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          투표 초대 링크 만들기
        </button>
      </form>
      {state.status === "error" ? <p className="text-sm text-danger">{state.message}</p> : null}
      {url ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">7일 동안 최대 20명이 참여할 수 있습니다.</p>
          <input
            readOnly
            value={url}
            aria-label="투표 초대 링크"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(new URL(url, window.location.origin).toString())}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            링크 복사
          </button>
        </div>
      ) : null}
    </div>
  );
}
