"use client";

import { useActionState, useState } from "react";

import { createVoteInviteAction } from "@/features/voting/actions";
import { shareInvite } from "@/features/voting/share-invite";
import { INVITE_IDLE } from "@/features/voting/types";

export function InviteLink({ tripId, tripTitle }: { tripId: string; tripTitle: string }) {
  const [state, action, pending] = useActionState(createVoteInviteAction, INVITE_IDLE);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const url = state.invitePath;

  async function copyInvite() {
    if (!url) return;
    setShareError(null);
    setShareNotice(null);
    try {
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString());
      setShareNotice("초대 링크를 복사했습니다. 카카오톡 대화창에 붙여 넣으세요.");
    } catch {
      setShareError("복사하지 못했습니다. 위의 초대 링크를 선택해 직접 복사해 주세요.");
    }
  }

  async function shareInvitation() {
    if (!url) return;
    setShareError(null);
    setShareNotice(null);
    try {
      const result = await shareInvite(url, tripTitle);
      if (result === "copied") {
        setShareNotice("초대 링크를 복사했습니다. 카카오톡 대화창에 붙여 넣으세요.");
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "공유하지 못했습니다. 링크를 복사해 전달해 주세요.");
    }
  }

  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tripId" value={tripId} />
        <label className="space-y-1 text-sm">
          <span className="block font-medium">초대할 역할</span>
          <select
            name="role"
            defaultValue="editor"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="editor">편집자 — 일정을 함께 고칠 수 있음</option>
            <option value="viewer">참여자 — 보기와 투표만</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          참여 초대 링크 만들기
        </button>
      </form>
      {state.status === "error" ? <p className="text-sm text-danger">{state.message}</p> : null}
      {url ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">7일 동안 최대 20명이 참여할 수 있습니다. 역할은 나중에 참여자 목록에서 바꿀 수 있습니다.</p>
          <input
            readOnly
            value={typeof window === "undefined" ? url : new URL(url, window.location.origin).toString()}
            aria-label="참여 초대 링크"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={copyInvite}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            링크 복사
          </button>
          <button
            type="button"
            onClick={shareInvitation}
            className="ml-2 rounded-lg bg-[#FEE500] px-3 py-2 text-sm font-medium text-[#191919] hover:brightness-95"
          >
            카카오톡 등으로 초대
          </button>
          <p className="text-xs text-muted-foreground">공유 창에서 카카오톡을 선택하세요. 공유 창이 지원되지 않으면 링크가 복사됩니다.</p>
          {shareNotice ? <p role="status" className="text-sm text-muted-foreground">{shareNotice}</p> : null}
          {shareError ? <p role="alert" className="text-sm text-danger">{shareError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
