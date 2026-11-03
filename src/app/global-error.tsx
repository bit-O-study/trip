"use client";

/**
 * 루트 레이아웃까지 실패했을 때의 마지막 화면.
 *
 * 이 파일은 레이아웃을 대신하므로 globals.css·AppShell 이 없다. 스타일은 인라인으로 둔다.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "Canvas", color: "CanvasText" }}>
        <title>문제가 생겼습니다 · Trip Planner</title>
        <main role="alert" style={{ maxWidth: 420, margin: "0 auto", padding: "64px 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>문제가 생겼습니다</h1>
          <p style={{ fontSize: 14, opacity: 0.75 }}>
            화면을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          {error.digest ? <p style={{ fontSize: 12, opacity: 0.6 }}>오류 코드: {error.digest}</p> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <button type="button" onClick={() => retry()} style={{ padding: "8px 16px", borderRadius: 8 }}>
              다시 시도
            </button>
            {/* 레이아웃이 깨진 상태라 클라이언트 라우터를 믿지 않고 전체 이동한다. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid currentColor", color: "inherit", textDecoration: "none" }}>
              여행 목록으로
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
