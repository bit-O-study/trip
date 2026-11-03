import type { NextConfig } from "next";

/**
 * 모든 응답에 거는 기본 보안 헤더.
 *
 * 전체 CSP(script-src 등)는 지도 SDK(Google·Kakao)가 동적으로 스크립트를 넣어
 * nonce 설계 없이 걸면 지도가 깨진다. 여기서는 부작용이 없는 것만 건다.
 *  - frame-ancestors 'none' / X-Frame-Options: 다른 사이트가 이 앱을 iframe 에
 *    넣어 클릭재킹(삭제·초대 수락 버튼 위에 투명 레이어)하지 못하게 한다.
 *  - Referrer-Policy: 다른 출처로는 주소의 경로(여행 id 등)를 보내지 않는다.
 *  - nosniff: 업로드·외부 응답이 다른 MIME 으로 해석되지 않게 한다.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

/**
 * 토큰이 주소에 실리거나 링크를 아는 사람만 보는 경로의 응답 헤더.
 *
 * 공유 뷰(/s, /share)와 초대(/invite/<token>)는 색인·캐시·Referrer 유출을 모두
 * 막아야 한다 (docs/architecture.md §6 "토큰이 로그·기록에 남는 문제").
 * 페이지의 robots 메타만으로는 하위 응답을 덮지 못해 헤더로도 함께 건다.
 * 같은 키는 뒤에 오는 규칙이 이긴다 — 그래서 기본 헤더보다 뒤에 둔다.
 */
const TOKEN_PATH_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/s/:path*", headers: TOKEN_PATH_HEADERS },
      { source: "/share/:path*", headers: TOKEN_PATH_HEADERS },
      { source: "/invite/:path*", headers: TOKEN_PATH_HEADERS },
    ];
  },
};

export default nextConfig;
