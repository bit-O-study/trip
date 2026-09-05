/**
 * 공개 공유 뷰에 내보내는 값.
 *
 * **화이트리스트다.** 필요한 필드만 여기에 적고, DB 행을 그대로 넘기지 않는다.
 * 블랙리스트("이건 빼자")로 만들면 컬럼이 하나 늘 때마다 조용히 새어 나간다
 * (docs/architecture.md §6 "응답 필드").
 *
 * 빠지는 것: 예약번호, 멤버·created_by, share_visibility = hidden 항목,
 * 첨부파일, 감사 기록, place_snapshot 원문.
 */
export type SharedItem = {
  id: string;
  type: string;
  title: string;
  note: string | null;
  locationText: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  coordinate: { latitude: number; longitude: number } | null;
};

export type SharedTrip = {
  shortId: string;
  title: string;
  destinationName: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  items: SharedItem[];
};

export type ShareLinkSummary = {
  id: string;
  shortId: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
};

export type ShareActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** 갓 발급한 링크. 원본 토큰은 이때 한 번만 보여 준다. */
  sharePath?: string;
};

export const SHARE_IDLE: ShareActionState = { status: "idle" };

/** 공유 세션 쿠키 이름. 값은 원본 토큰이며 HttpOnly 라 스크립트가 읽지 못한다. */
export const SHARE_COOKIE = "trip_share";

/** 쿠키 수명. 링크 자체의 만료와 별개로 짧게 둔다. */
export const SHARE_COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
