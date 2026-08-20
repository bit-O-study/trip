"use client";

import { useEffect, useRef, useState } from "react";

import {
  loadKakaoMaps,
  MapLoadError,
  type KakaoMap,
  type KakaoMaps,
  type KakaoOverlay,
} from "@/features/map/kakao-sdk";
import { dayColor } from "@/lib/day-color";

export type MapPoint = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  /** 0-based. 색상을 정한다. */
  dayIndex: number;
  /** 그 날의 방문 순번 (1-based) */
  order: number;
};

type Props = {
  points: MapPoint[];
  /** 지도 높이. 모바일 바텀시트로 바뀌면 조정한다. */
  className?: string;
  /** 타임라인과 공유하는 선택 항목 */
  selectedId?: string | null;
  /** 선택한 항목으로 지도를 옮길지. 지도에서 시작한 선택이면 옮기지 않는다. */
  recenter?: boolean;
  onSelect?: (id: string) => void;
};

/** 서울시청. 좌표가 하나도 없을 때의 기본 중심. */
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 };

/**
 * 마커는 `button` 이다. 지도 위 클릭만 되는 요소를 만들면 키보드 사용자에게는
 * 지도가 통째로 사라진다. CustomOverlay 의 clickable 을 켜야 DOM 이벤트가
 * 지도에 먹히지 않고 버튼까지 도달한다.
 */
function markerButton(point: MapPoint, onSelect: (id: string) => void): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.dataset.pointId = point.id;
  el.textContent = String(point.order);
  el.setAttribute("aria-label", `${point.order}번째 일정 ${point.title}`);
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:26px",
    "height:26px",
    "padding:0",
    "cursor:pointer",
    "border-radius:9999px",
    "border:2px solid #fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.35)",
    "font:600 12px/1 system-ui,sans-serif",
    "color:#fff",
    "transition:transform .12s ease, box-shadow .12s ease",
    `background:${dayColor(point.dayIndex)}`,
  ].join(";");
  el.addEventListener("click", () => onSelect(point.id));
  return el;
}

/** 선택된 마커를 키운다. 색은 Day 를 뜻하므로 바꾸지 않고 크기·테두리로만 구분한다. */
function applyMarkerSelection(el: HTMLElement, selected: boolean) {
  el.setAttribute("aria-pressed", String(selected));
  el.style.transform = selected ? "scale(1.45)" : "scale(1)";
  el.style.boxShadow = selected
    ? "0 0 0 4px rgba(37,99,235,.45), 0 2px 8px rgba(0,0,0,.4)"
    : "0 1px 4px rgba(0,0,0,.35)";
  el.style.zIndex = selected ? "999" : "";
}

export function TripMap({ points, className, selectedId, recenter, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  /** 선택이 바뀔 때마다 마커를 다시 그리지 않으려고 DOM 을 들고 있는다. */
  const markersRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const [maps, setMaps] = useState<KakaoMaps | null>(null);
  const [error, setError] = useState<MapLoadError | null>(null);

  // 콜백은 ref 로 받는다. 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다
  // 마커를 전부 다시 만들고 setBounds 가 함께 돌아 지도가 튄다.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps(process.env.NEXT_PUBLIC_KAKAO_JS_KEY)
      .then((loaded) => {
        if (!cancelled) setMaps(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(
          caught instanceof MapLoadError
            ? caught
            : new MapLoadError("지도를 불러오지 못했습니다.", "network"),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!maps || !containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new maps.Map(containerRef.current, {
        center: new maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng),
        level: 5,
      });
    }
    const map = mapRef.current;

    // 이전 마커·선을 지운다. 지우지 않으면 갱신할 때마다 겹쳐 쌓인다.
    for (const overlay of overlaysRef.current) overlay.setMap(null);
    overlaysRef.current = [];
    markersRef.current = new Map();
    positionsRef.current = new Map();

    if (points.length === 0) return;

    const bounds = new maps.LatLngBounds();

    for (const point of points) {
      const position = new maps.LatLng(point.latitude, point.longitude);
      bounds.extend(position);

      const element = markerButton(point, (id) => onSelectRef.current?.(id));
      markersRef.current.set(point.id, element);
      positionsRef.current.set(point.id, { lat: point.latitude, lng: point.longitude });

      const overlay = new maps.CustomOverlay({
        position,
        content: element,
        yAnchor: 0.5,
        zIndex: 10 + point.order,
        clickable: true,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    }

    /*
     * 같은 Day 안에서만 선을 잇는다.
     *
     * 이 선은 "방문 순서 연결선"이지 실제 이동 경로가 아니다. 길찾기를 붙이기
     * 전까지는 직선이므로 점선으로 그려 경로선과 구분한다.
     */
    const byDay = new Map<number, MapPoint[]>();
    for (const point of points) {
      const list = byDay.get(point.dayIndex);
      if (list) list.push(point);
      else byDay.set(point.dayIndex, [point]);
    }

    for (const [dayIndex, dayPoints] of byDay) {
      if (dayPoints.length < 2) continue;
      const path = [...dayPoints]
        .sort((a, b) => a.order - b.order)
        .map((p) => new maps.LatLng(p.latitude, p.longitude));

      const line = new maps.Polyline({
        path,
        strokeWeight: 3,
        strokeColor: dayColor(dayIndex),
        strokeOpacity: 0.8,
        strokeStyle: "shortdash",
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    map.setBounds(bounds, 48, 48, 48, 48);
  }, [maps, points]);

  // 선택 반영은 마커를 다시 만들지 않는다. 다시 만들면 setBounds 가 함께 돌아
  // 항목을 누를 때마다 지도 축척이 튄다.
  useEffect(() => {
    for (const [id, element] of markersRef.current) {
      applyMarkerSelection(element, id === selectedId);
    }

    if (!recenter || !selectedId || !mapRef.current || !maps) return;
    const position = positionsRef.current.get(selectedId);
    if (!position) return;
    mapRef.current.panTo(new maps.LatLng(position.lat, position.lng));
  }, [selectedId, recenter, maps, points]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center ${className ?? ""}`}
      >
        <p className="text-sm font-medium">지도를 표시할 수 없습니다</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {error.kind === "not_configured"
            ? "지도 키가 설정되지 않았습니다."
            : "네트워크나 Kakao 도메인 등록을 확인하세요."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          아래 목록으로 일정은 그대로 확인하고 편집할 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        role="application"
        aria-label="여행 일정 지도"
        className="size-full min-h-64 rounded-xl border border-border bg-muted"
      />
      {points.length > 0 ? (
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
