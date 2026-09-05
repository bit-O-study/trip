"use client";

import { useActionState, useState } from "react";

import {
  createShareLinkAction,
  revokeShareLinkAction,
  rotateShareLinkAction,
} from "@/features/share/actions";
import { SHARE_IDLE, type ShareActionState, type ShareLinkSummary } from "@/features/share/types";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";

type Props = { tripId: string; links: ShareLinkSummary[]; readable: boolean };

function absolute(path: string): string {
  return typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
}

function statusLabel(link: ShareLinkSummary): string {
  if (link.revokedAt) return "폐기됨";
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return "만료됨";
  return "사용 중";
}

/**
 * 공개 공유 링크 관리.
 *
 * 원본 토큰은 발급 직후 이 화면에서 **한 번만** 보인다. DB 에는 해시만 있어
 * 나중에 다시 꺼낼 방법이 없다. 잃어버리면 회전(기존 폐기 + 새 발급)이
 * 유일한 복구 경로이고, 그래서 회전 버튼을 같은 자리에 둔다.
 */
export function ShareLinkManager({ tripId, links, readable }: Props) {
  const [created, createAction, creating] = useActionState<ShareActionState, FormData>(
    createShareLinkAction,
    SHARE_IDLE,
  );
  const [rotated, rotateAction, rotating] = useActionState<ShareActionState, FormData>(
    rotateShareLinkAction,
    SHARE_IDLE,
  );
  const [copied, setCopied] = useState(false);

  const fresh = rotated.sharePath ? rotated : created;
  const active = links.filter((link) => statusLabel(link) === "사용 중");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">공개 공유 링크</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          로그인 없이 일정을 <strong>읽기만</strong> 할 수 있는 링크입니다. 예약번호와 참여자
          정보는 나가지 않고, 30일 뒤 자동으로 만료됩니다.
        </p>
      </div>

      {/*
        키가 없으면 링크는 만들어지지만 아무도 못 연다. 만들기 전에 말해 준다 —
        "만들었는데 상대가 못 본다" 를 나중에 알게 되는 것이 최악이다.
      */}
      {readable ? null : (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          서버에 SUPABASE_SERVICE_ROLE_KEY 가 없어 지금 만든 링크는 열리지 않습니다.
          환경변수를 설정한 뒤 사용하세요.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={createAction}>
          <input type="hidden" name="tripId" value={tripId} />
          <button
            type="submit"
            disabled={creating || rotating}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {creating ? "만드는 중…" : "공유 링크 만들기"}
          </button>
        </form>
        {active.length > 0 ? (
          <form action={rotateAction}>
            <input type="hidden" name="tripId" value={tripId} />
            <button
              type="submit"
              disabled={creating || rotating}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {rotating ? "교체 중…" : "링크 새로 발급(기존 폐기)"}
            </button>
          </form>
        ) : null}
      </div>

      {fresh.status === "error" && fresh.message ? (
        <p role="alert" className="text-sm text-danger">{fresh.message}</p>
      ) : null}

      {fresh.sharePath ? (
        <div className="space-y-1 rounded-lg border border-primary/40 bg-primary/5 px-3 py-3">
          <p className="text-xs font-medium text-primary">
            지금 한 번만 표시됩니다. 복사해서 전달하세요.
          </p>
          <input
            readOnly
            value={absolute(fresh.sharePath)}
            aria-label="공개 공유 링크"
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(absolute(fresh.sharePath!));
              setCopied(true);
            }}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            {copied ? "복사했습니다" : "링크 복사"}
          </button>
        </div>
      ) : null}

      {links.length > 0 ? (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {statusLabel(link)}
                  <span className="ml-2 font-normal text-muted-foreground">
                    열람 {link.accessCount}회
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {link.expiresAt ? `${link.expiresAt.slice(0, 10)} 만료` : "만료 없음"}
                  {link.lastAccessedAt
                    ? ` · 마지막 열람 ${link.lastAccessedAt.slice(0, 10)}`
                    : " · 아직 열람 없음"}
                </p>
              </div>
              {link.revokedAt ? null : (
                <form action={revokeShareLinkAction}>
                  <input type="hidden" name="tripId" value={tripId} />
                  <input type="hidden" name="linkId" value={link.id} />
                  <DeleteSubmitButton
                    idleLabel="폐기"
                    pendingLabel="폐기 중…"
                    ariaLabel="이 공유 링크 폐기"
                    className="rounded-lg border border-danger px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger hover:text-primary-foreground"
                  />
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
