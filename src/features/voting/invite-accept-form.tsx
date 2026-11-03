"use client";

import Link from "next/link";
import { useActionState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { acceptInviteAction } from "@/features/voting/actions";

/**
 * 초대 수락. 실패하면 전체 오류 화면으로 보내지 않고 이 자리에서 이유를 알려 준다.
 * 만료·폐기된 링크는 다시 눌러도 소용이 없으므로 "새 링크를 요청하라" 고 말해 준다.
 */
export function InviteAcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(acceptInviteAction, IDLE);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <button
        disabled={pending}
        className="w-full rounded-full bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "참여하는 중…" : "초대 수락하고 참여하기"}
      </button>
      {state.status === "error" ? (
        <div role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-left text-sm text-warn">
          <p className="font-medium">{state.message}</p>
          <p className="mt-1 text-xs">같은 링크를 다시 눌러도 해결되지 않아요. 초대한 사람에게 새 링크를 요청해 주세요.</p>
          <Link href="/" className="mt-2 inline-block text-xs font-medium underline underline-offset-4">내 여행으로 가기</Link>
        </div>
      ) : null}
    </form>
  );
}
