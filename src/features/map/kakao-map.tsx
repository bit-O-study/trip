"use client";

import { useEffect, useRef, useState } from "react";

import { dayColor } from "@/lib/day-color";

import { MapLoadError } from "./errors";
import { loadKakaoMaps, type KakaoMap, type KakaoMaps, type KakaoOverlay } from "./kakao-sdk";
import { applyMarkerSelection, groupByDay, markerButton } from "./marker";
import type { TripMapProps } from "./types";

/** 서울시청. 좌표가 하나도 없을 때의 기본 중심. */
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 };

/** 지도 레벨은 숫자가 클수록 넓다. 목적지 하나만 아는 상태의 기본값. */
const INITIAL_LEVEL = 5;

type Props = TripMapProps & { onError: (error: MapLoadError) => void };

/** 국내 여행용 지도. 무료 쿼터로 충분하고 국내 지도 품질도 가장 낫다. */
export function KakaoTripMap({
  points,
  selectedId,
  recenter,
  onSelect,
  initialCenter,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<KakaoOverlay[]>([]);
  /** 선택이 바뀔 때마다 마커를 다시 그리지 않으려고 DOM 을 들고 있는다. */
  const markersRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const [maps, setMaps] = useState<KakaoMaps | null>(null);

  // 콜백은 ref 로 받는다. 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다
  // 마커를 전부 다시 만들고 setBounds 가 함께 돌아 지도가 튄다.
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onErrorRef.current = onError;
  }, [onSelect, onError]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoMaps(process.env.NEXT_PUBLIC_KAKAO_JS_KEY)
      .then((loaded) => {
        if (!cancelled) setMaps(loaded);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        onErrorRef.current(
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
      const center = initialCenter
        ? new maps.LatLng(initialCenter.latitude, initialCenter.longitude)
        : new maps.LatLng(FALLBACK_CENTER.lat, FALLBACK_CENTER.lng);
      mapRef.current = new maps.Map(containerRef.current, { center, level: INITIAL_LEVEL });
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

    for (const [dayIndex, dayPoints] of groupByDay(points)) {
      if (dayPoints.length < 2) continue;
      const line = new maps.Polyline({
        path: dayPoints.map((p) => new maps.LatLng(p.latitude, p.longitude)),
        strokeWeight: 3,
        strokeColor: dayColor(dayIndex),
        strokeOpacity: 0.8,
        strokeStyle: "shortdash",
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    map.setBounds(bounds, 48, 48, 48, 48);
  }, [maps, points, initialCenter]);

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

  return (
    <div
      ref={containerRef}
      data-testid="trip-map"
      data-map-provider="kakao"
      role="application"
      aria-label="여행 일정 지도"
      className="size-full min-h-64 rounded-xl border border-border bg-muted"
    />
  );
}
