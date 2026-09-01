"use client";

import { useCallback, useState } from "react";

import type { MapLoadError } from "./errors";
import { GoogleTripMap } from "./google-map";
import { KakaoTripMap } from "./kakao-map";
import { isDomesticTrip } from "./region";
import type { TripMapProps } from "./types";

export type { MapPoint } from "./types";

type MapProvider = "kakao" | "google";

type Props = TripMapProps & {
  /** 여행의 기준 시간대. 좌표가 아직 없는 여행의 국내/해외 판정에 쓴다. */
  timezone?: string | null;
};

/**
 * Google 이 콘솔에 찍는 오류 이름별 대응.
 *
 * 이름을 그대로 보여 주면 검색은 되지만 무엇을 눌러야 하는지는 알 수 없다.
 * 이 표는 그 한 걸음을 대신한다.
 */
const GOOGLE_AUTH_HINTS: Record<string, string> = {
  BillingNotEnabledMapError:
    "Google Cloud 프로젝트에 결제 계정이 연결되지 않았습니다. 무료 크레딧도 결제 계정이 있어야 적용됩니다.",
  ApiNotActivatedMapError:
    "Google Cloud 프로젝트에서 Maps JavaScript API가 사용 설정되지 않았습니다.",
  RefererNotAllowedMapError: "이 주소가 지도 키의 웹사이트 제한 목록에 없습니다.",
  InvalidKeyMapError: "지도 키가 올바르지 않습니다.",
  ExpiredKeyMapError: "지도 키가 만료됐습니다.",
};

/**
 * 등록할 주소를 찍어 주는 건 도메인 문제일 때뿐이다. 결제 미연결에까지 붙이면
 * 엉뚱한 곳을 손보게 만든다.
 */
function needsOriginRegistered(error: MapLoadError): boolean {
  if (error.kind === "network" || error.kind === "timeout") return true;
  return error.kind === "auth" && error.detail === "RefererNotAllowedMapError";
}
/** 공급자별로 사용자가 손댈 수 있는 다음 행동이 다르다. */
function errorDetail(error: MapLoadError, provider: MapProvider): string {
  if (error.kind === "not_configured") {
    return provider === "kakao"
      ? "지도 키(NEXT_PUBLIC_KAKAO_JS_KEY)가 설정되지 않았습니다."
      : "지도 키(NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)가 설정되지 않았습니다.";
  }
  if (error.kind === "auth") {
    return (
      (error.detail && GOOGLE_AUTH_HINTS[error.detail]) ??
      "Google Cloud 프로젝트의 결제 계정 연결, Maps JavaScript API 사용 설정, 키의 웹사이트 제한을 차례로 확인하세요."
    );
  }
  return provider === "kakao"
    ? "네트워크 문제이거나, Kakao 개발자 콘솔에 이 사이트 도메인이 등록되지 않았습니다."
    : "네트워크 문제이거나, 지도 스크립트를 받지 못했습니다.";
}

/**
 * 국내 여행은 Kakao, 해외 여행은 Google 로 그린다.
 *
 * 두 SDK 를 한 컴포넌트에 우겨넣지 않는 이유는 오버레이 모델이 다르기 때문이다.
 * Kakao 는 CustomOverlay 가 좌표를 잡아 주고 Google 은 OverlayView 안에서 픽셀을
 * 직접 계산한다. 공통으로 남는 것은 마커 DOM 과 실패 안내뿐이라 그 둘만 공유한다.
 *
 * 판정 기준은 `region.ts` 에 있다. 여기서는 고른 결과만 쓴다.
 */
export function TripMap({ timezone, ...props }: Props) {
  const provider: MapProvider = isDomesticTrip({ points: props.points, timezone })
    ? "kakao"
    : "google";

  /*
   * 실패는 그것을 낸 공급자와 함께 기억한다.
   *
   * 국내 일정만 있던 여행에 해외 장소가 하나 붙으면 지도는 Kakao 에서 Google 로
   * 넘어간다. 그때 앞 공급자의 실패는 더 이상 사실이 아니므로, 상태를 지우는
   * 대신 지금 공급자의 것일 때만 읽는다.
   */
  const [failure, setFailure] = useState<{ provider: MapProvider; error: MapLoadError } | null>(
    null,
  );
  const error = failure?.provider === provider ? failure.error : null;

  const handleError = useCallback(
    (caught: MapLoadError) => setFailure({ provider, error: caught }),
    [provider],
  );

  if (error) {
    /*
     * 스크립트 로드 실패는 원인이 화면에 드러나지 않는다. Kakao 는 도메인 미등록
     * 이면 401 JSON 을 스크립트 자리에 돌려주고, Google 은 인증 실패를 콘솔로만
     * 알린다. 어느 쪽이든 브라우저는 onerror 밖에 주지 않으므로, 등록해야 할
     * 주소를 그대로 찍어 준다 — "도메인 등록을 확인하세요" 만으로는 어떤 문자열을
     * 넣어야 하는지 알 수 없다.
     */
    const origin = typeof window === "undefined" ? null : window.location.origin;

    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center ${props.className ?? ""}`}
      >
        <p className="text-sm font-medium">지도를 표시할 수 없습니다</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorDetail(error, provider)}</p>
        {error.kind === "auth" && error.detail ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Google 오류: <code className="font-mono">{error.detail}</code>
          </p>
        ) : null}
        {needsOriginRegistered(error) && origin ? (
          <p className="mt-1 text-xs text-muted-foreground">
            등록할 주소: <code className="font-mono">{origin}</code>
          </p>
        ) : null}
        <p className="hidden">
          아래 목록으로 일정은 그대로 확인하고 편집할 수 있습니다.
        </p>
      </div>
    );
  }

  const Provider = provider === "kakao" ? KakaoTripMap : GoogleTripMap;

  return (
    <div className={props.className}>
      <Provider key={provider} {...props} onError={handleError} />
      {props.points.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          점선은 방문 순서를 잇는 선이며 실제 이동 경로가 아닙니다. 마커를 누르면 아래
          타임라인에서 같은 일정을 찾아 줍니다.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          장소를 검색해 일정에 추가하면 지도에 표시됩니다.
        </p>
      )}
    </div>
  );
}
