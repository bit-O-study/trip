import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
