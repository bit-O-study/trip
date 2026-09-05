import type { NextConfig } from "next";

/**
 * 공개 공유 경로의 응답 헤더.
 *
 * 공유 뷰는 링크를 아는 사람만 보는 화면이라 색인·캐시·Referrer 유출을 모두
 * 막아야 한다 (docs/architecture.md §6 "토큰이 로그·기록에 남는 문제").
 * 페이지의 robots 메타만으로는 하위 응답을 덮지 못해 헤더로도 함께 건다.
 */
const SHARE_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/s/:path*", headers: SHARE_HEADERS },
      { source: "/share/:path*", headers: SHARE_HEADERS },
    ];
  },
};

export default nextConfig;
