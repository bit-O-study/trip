"use client";

import { useCallback, useState } from "react";

import type { MapLoadError } from "./errors";
import dynamic from "next/dynamic";
const GoogleTripMap = dynamic(() => import("./google-map").then((m) => m.GoogleTripMap));
const KakaoTripMap = dynamic(() => import("./kakao-map").then((m) => m.KakaoTripMap));
import { isDomesticTrip } from "./region";
import type { TripMapProps } from "./types";

export type { MapPoint } from "./types";

type MapProvider = "kakao" | "google";

type Props = TripMapProps & {
  /** 여행의 기준 시간대. 좌표가 아직 없는 여행의 국내/해외 판정에 쓴다. */
  timezone?: string | null;
};

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
    return (
      <div role="status" className={"flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-rail bg-card px-6 py-8 text-center " + (props.className ?? "")}>
        <p className="text-sm font-medium">지도를 표시할 수 없습니다</p>
        <p className="text-sm text-muted-foreground">일정 목록은 계속 확인하고 편집할 수 있습니다.</p>
        {error.kind === "network" || error.kind === "timeout" ? <button type="button" onClick={() => setFailure(null)} className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm">지도 다시 불러오기</button> : <p className="text-xs text-muted-foreground">지도를 일시적으로 이용할 수 없습니다. 잠시 후 다시 방문해 주세요.</p>}
      </div>
    );
  }

  const Provider = provider === "kakao" ? KakaoTripMap : GoogleTripMap;

  return (
    <div className="space-y-2">
      <div className={props.className ?? "h-64 md:h-80"}>
      <Provider key={provider} {...props} onError={handleError} />
      </div>
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
