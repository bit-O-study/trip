"use client";

import { useActionState, useState } from "react";

import { createVoteInviteAction } from "@/features/voting/actions";
import { INVITE_IDLE } from "@/features/voting/types";

type KakaoSdk = {
  isInitialized(): boolean;
  init(key: string): void;
  Share: { sendDefault(options: Record<string, unknown>): void };
};

declare global {
  interface Window { Kakao?: KakaoSdk }
}

async function loadKakaoSdk(): Promise<KakaoSdk> {
  if (!window.Kakao) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk="share"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("카카오 SDK를 불러오지 못했습니다.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
      script.dataset.kakaoSdk = "share";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("카카오 SDK를 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
  }
  if (!window.Kakao) throw new Error("카카오 SDK를 사용할 수 없습니다.");
  const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
  if (!key) throw new Error("카카오 JavaScript 키가 설정되지 않았습니다.");
  if (!window.Kakao.isInitialized()) window.Kakao.init(key);
  return window.Kakao;
}

export function InviteLink({ tripId, tripTitle }: { tripId: string; tripTitle: string }) {
  const [state, action, pending] = useActionState(createVoteInviteAction, INVITE_IDLE);
  const [shareError, setShareError] = useState<string | null>(null);
  const url = state.invitePath;

  async function shareToKakao() {
    if (!url) return;
    const inviteUrl = new URL(url, window.location.origin).toString();
    setShareError(null);
    try {
      const kakao = await loadKakaoSdk();
      kakao.Share.sendDefault({
        objectType: "text",
        text: `${tripTitle} 여행에 초대합니다. 함께 일정을 확인하고 음식점 투표에 참여해 보세요.`,
        link: { mobileWebUrl: inviteUrl, webUrl: inviteUrl },
        buttonTitle: "초대 수락하기",
      });
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "카카오톡 공유를 시작하지 못했습니다.");
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
            value={url}
            aria-label="참여 초대 링크"
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
          <button
            type="button"
            onClick={shareToKakao}
            className="ml-2 rounded-lg bg-[#FEE500] px-3 py-2 text-sm font-medium text-[#191919] hover:brightness-95"
          >
            카카오톡으로 초대
          </button>
          {shareError ? <p role="alert" className="text-sm text-danger">{shareError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
