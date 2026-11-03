"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 라우트 오류 화면.
 *
 * 서버 컴포넌트·서버 액션이 던진 오류는 운영 빌드에서 메시지가 가려진 채로
 * 넘어온다(digest 만 남는다). 그래서 원문을 보여 주지 않고, 사용자가 할 수 있는
 * 일(다시 시도·목록으로)만 안내한다.
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">문제가 생겼습니다</h1>
      <p className="text-sm text-muted-foreground">
        요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요. 방금 한 작업은 이미
        반영됐을 수 있으니, 같은 문제가 반복되면 여행 목록에서 상태를 먼저 확인해 주세요.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">오류 코드: {error.digest}</p>
      ) : null}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          다시 시도
        </button>
        <Link href="/" className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          여행 목록으로
        </Link>
      </div>
    </div>
  );
}
