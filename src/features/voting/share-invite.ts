/** 웹 주소를 그대로 공유해 다른 카카오 앱의 출처 링크나 네이티브 스킴을 넣지 않는다. */
export async function shareInvite(path: string, tripTitle: string): Promise<"shared" | "copied" | "cancelled"> {
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/invite/")) {
    throw new Error("올바르지 않은 초대 링크입니다.");
  }

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${tripTitle} · Trip Planner`,
        text: `${tripTitle} 여행에 초대합니다. 함께 일정을 확인하고 음식점 투표에 참여해 보세요.`,
        url: url.toString(),
      });
      return "shared";
    } catch (error) {
      if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") return "cancelled";
      // 공유 시트가 차단된 웹뷰 등에서도 URL을 전달할 수 있게 한다.
    }
  }

  try {
    await navigator.clipboard.writeText(url.toString());
    return "copied";
  } catch {
    throw new Error("공유하지 못했습니다. 초대 링크를 선택해 직접 복사해 주세요.");
  }
}
