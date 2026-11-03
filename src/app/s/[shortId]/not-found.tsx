/**
 * 공유 뷰의 404.
 *
 * 공유 화면은 로그인 없이 열리므로 "여행 목록으로" 를 안내하지 않는다. 쿠키가 없거나
 * 다른 공유 링크의 쿠키로 덮였을 때도 여기로 온다 — 받은 공유 링크를 다시 열면 된다.
 */
export default function SharedTripNotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">공유된 일정을 열 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">
        링크가 만료됐거나 폐기됐을 수 있습니다. 받은 공유 링크를 처음부터 다시 열어 보고,
        그래도 안 되면 링크를 보낸 사람에게 새 링크를 요청해 주세요.
      </p>
      <p className="text-xs text-muted-foreground">
        여러 공유 링크를 차례로 열었다면 마지막에 연 링크만 유효합니다. 이 일정의 링크를 다시
        눌러 주세요.
      </p>
    </div>
  );
}
