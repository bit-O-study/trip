/**
 * 지도 로드 실패는 공급자와 무관하게 같은 방식으로 다룬다.
 *
 * 국내는 Kakao, 해외는 Google 을 쓰지만 화면이 보여 줄 것은 하나다 — 지도를
 * 못 띄웠다는 사실과, 사용자가 손댈 수 있는 다음 행동. 그래서 오류 타입을
 * 공급자별로 나누지 않고 여기 한 곳에 둔다.
 */
export type MapLoadErrorKind =
  /** 키가 없다. 배포 환경변수 누락이 대부분이다. */
  | "not_configured"
  /** 스크립트를 못 받았다. 네트워크이거나 도메인 미등록이다. */
  | "network"
  | "timeout"
  /** 스크립트는 받았지만 공급자가 인증을 거부했다. 결제·API 사용 설정·도메인 제한. */
  | "auth";

export class MapLoadError extends Error {
  constructor(
    message: string,
    readonly kind: MapLoadErrorKind,
    /**
     * 공급자가 준 원인 코드. Google 인증 실패의 오류 이름이 여기 들어온다
     * (BillingNotEnabledMapError 등). 화면 문구를 원인별로 가르는 데 쓴다.
     */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "MapLoadError";
  }
}
