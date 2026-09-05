import type { ReactNode } from "react";
import Link from "next/link";

/**
 * 법적 고지 공통 틀.
 *
 * 로그인 없이 읽을 수 있어야 한다 — 가입 전에 무엇에 동의하는지 확인할 수
 * 없으면 고지의 의미가 없다. 공개 경로 화이트리스트(`src/lib/auth/paths.ts`)에
 * `/legal` 이 들어 있어야 한다.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <article className="space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:text-muted-foreground [&_ul]:space-y-1 [&_ul]:text-muted-foreground">
        {children}
      </article>
      <nav className="flex gap-4 border-t border-border pt-4 text-sm">
        <Link href="/legal/privacy" className="text-muted-foreground hover:underline">개인정보처리방침</Link>
        <Link href="/legal/location" className="text-muted-foreground hover:underline">위치정보 이용 고지</Link>
        <Link href="/" className="text-muted-foreground hover:underline">홈으로</Link>
      </nav>
    </div>
  );
}
