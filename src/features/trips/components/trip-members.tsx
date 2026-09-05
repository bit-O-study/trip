"use client";

import { useRef } from "react";

import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";
import { SubmitButton } from "@/features/trips/components/submit-button";
import {
  leaveTripAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/features/trips/member-actions";
import type { TripMember, TripRole } from "@/features/trips/types";

const ROLE_LABEL: Record<TripRole, string> = {
  owner: "소유자",
  editor: "편집자",
  viewer: "참여자",
};

const ROLE_HINT: Record<TripRole, string> = {
  owner: "모든 권한 · 참여자와 여행 삭제 관리",
  editor: "일정을 함께 고칠 수 있음",
  viewer: "보기와 투표만",
};

type Props = {
  members: TripMember[];
  /** 참여자를 관리할 수 있는가. owner 만 true. */
  manageable?: boolean;
  tripId?: string;
  /** 지금 보고 있는 사람. "나" 표시와 나가기 버튼에 쓴다. */
  currentUserId?: string | null;
};

function initials(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase();
}

function Avatar({ member, className = "size-9" }: { member: TripMember; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground ${className}`}
      style={member.avatarUrl ? { backgroundImage: `url(${member.avatarUrl})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}
    >
      {member.avatarUrl ? null : initials(member.displayName)}
    </span>
  );
}

export function TripMembers({ members, manageable = false, tripId, currentUserId }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  if (members.length === 0) return null;

  const owners = members.filter((member) => member.role === "owner").length;
  const me = members.find((member) => member.userId === currentUserId);
  /*
   * 마지막 소유자는 나갈 수 없다. DB 트리거가 최종 방어선이지만, 누를 수 없는
   * 버튼을 보여 주는 것보다 왜 안 되는지 먼저 말하는 편이 낫다.
   */
  const canLeave = Boolean(tripId && me && !(me.role === "owner" && owners <= 1));

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`함께하는 사람 ${members.length}명 보기`}
        className="flex items-center rounded-full py-1 pl-2 pr-1 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="mr-2 hidden text-xs font-medium text-muted-foreground sm:inline">함께 {members.length}</span>
        <span className="flex -space-x-2">
          {members.slice(0, 4).map((member) => <Avatar key={member.userId} member={member} />)}
          {members.length > 4 ? (
            <span aria-hidden className="grid size-9 place-items-center rounded-full border-2 border-background bg-muted text-xs font-semibold">
              +{members.length - 4}
            </span>
          ) : null}
        </span>
      </button>

      <dialog ref={dialogRef} className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/40">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold">함께하는 사람들</h2>
          <form method="dialog">
            <button className="rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted" aria-label="닫기">닫기</button>
          </form>
        </div>

        <ul className="max-h-[60vh] space-y-1 overflow-y-auto p-3">
          {members.map((member) => {
            const isMe = member.userId === currentUserId;
            return (
              <li key={member.userId} className="space-y-2 rounded-xl px-2 py-2 hover:bg-muted/60">
                <div className="flex items-center gap-3">
                  <Avatar member={member} className="size-11" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {member.displayName}
                      {isMe ? <span className="ml-1 text-xs text-muted-foreground">(나)</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[member.role]} · {ROLE_HINT[member.role]}
                    </p>
                  </div>
                </div>

                {manageable && tripId ? (
                  <div className="flex flex-wrap items-center gap-2 pl-14">
                    <form action={updateMemberRoleAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="tripId" value={tripId} />
                      <input type="hidden" name="userId" value={member.userId} />
                      <label htmlFor={`role-${member.userId}`} className="sr-only">
                        {member.displayName} 역할
                      </label>
                      <select
                        id={`role-${member.userId}`}
                        name="role"
                        defaultValue={member.role}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      >
                        <option value="owner">소유자</option>
                        <option value="editor">편집자</option>
                        <option value="viewer">참여자</option>
                      </select>
                      <SubmitButton
                        idleLabel="역할 변경"
                        pendingLabel="변경 중…"
                        ariaLabel={`${member.displayName} 역할 변경`}
                        className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                      />
                    </form>
                    {isMe ? null : (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="tripId" value={tripId} />
                        <input type="hidden" name="userId" value={member.userId} />
                        <DeleteSubmitButton
                          idleLabel="내보내기"
                          pendingLabel="내보내는 중…"
                          ariaLabel={`${member.displayName} 내보내기`}
                          className="rounded-lg border border-danger px-2 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-primary-foreground"
                        />
                      </form>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {tripId && me ? (
          <div className="border-t border-border px-5 py-3">
            {canLeave ? (
              <form action={leaveTripAction}>
                <input type="hidden" name="tripId" value={tripId} />
                <DeleteSubmitButton
                  idleLabel="이 여행에서 나가기"
                  pendingLabel="나가는 중…"
                  className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:border-danger hover:text-danger"
                />
              </form>
            ) : (
              <p className="text-xs text-muted-foreground">
                마지막 소유자는 나갈 수 없습니다. 다른 사람을 소유자로 지정한 뒤에 나가세요.
              </p>
            )}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
