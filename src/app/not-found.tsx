import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다",
  robots: { index: false, follow: false },
};

/**
 * 없는 주소, 볼 권한이 없는 여행, 삭제된 투표가 모두 여기로 온다.
 * 권한 없음과 없음을 구분하지 않는다 — 구분하면 id 를 넣어 보며 존재 여부를 알아낼 수 있다.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">페이지를 찾을 수 없습니다</h1>
      <p className="text-sm text-muted-foreground">
        주소가 바뀌었거나 삭제됐을 수 있습니다. 함께하는 여행이라면 초대받은 계정으로
        로그인했는지 확인해 주세요.
      </p>
      <Link
        href="/"
        className="inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        여행 목록으로
      </Link>
    </div>
  );
}
