import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getCurrentUser } from "@/lib/supabase/user";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Trip Planner",
    template: "%s · Trip Planner",
  },
  description:
    "항공편, 숙소, 맛집과 자유 일정을 한 타임라인에서 관리하는 여행 일정 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /* 노치·홈 인디케이터 영역까지 배경을 채우고, safe-area 변수를 사용 가능하게 한다 */
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  /*
   * maximumScale / userScalable 은 의도적으로 설정하지 않는다.
   * 확대를 막으면 접근성 요구를 위반한다.
   */
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * 셸이 로그인 상태에 따라 달라지므로 레이아웃이 동적 렌더링이 된다.
   * 인증이 필요한 앱에서는 정상이다. 공개 공유 뷰(/s/...)는 별도 레이아웃으로
   * 분리해 정적 렌더링을 되찾을 수 있다(8단계).
   */
  const user = await getCurrentUser();

  return (
    <html lang="ko">
      <body className="antialiased">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  );
}
