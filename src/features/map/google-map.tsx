"use client";

import { useEffect, useRef, useState } from "react";

import { dayColor } from "@/lib/day-color";

import { MapLoadError } from "./errors";
import { loadGoogleMaps, onMapAuthFailure, type GoogleMapsLibraries } from "./google-sdk";
import { applyMarkerSelection, groupByDay, markerButton } from "./marker";
import type { TripMapProps } from "./types";

/** 서울시청. 좌표가 하나도 없을 때의 기본 중심. */
const FALLBACK_CENTER = { lat: 37.5665, lng: 126.978 };

/** Google 오버레이는 좌표를 left/top 으로 넣는다. 요소가 스스로 중심을 잡아야 한다. */
const MARKER_BASE_TRANSFORM = "translate(-50%, -50%)";

function createMarkerOverlay(
  maps: GoogleMapsLibraries,
  map: google.maps.Map,
  position: google.maps.LatLng,
  element: HTMLElement,
): google.maps.OverlayView {
  class MarkerOverlay extends maps.OverlayView {
    onAdd() {
      this.getPanes()?.overlayMouseTarget.appendChild(element);
    }

    draw() {
      const pixel = this.getProjection().fromLatLngToDivPixel(position);
      if (!pixel) return;
      element.style.position = "absolute";
      element.style.left = `${pixel.x}px`;
      element.style.top = `${pixel.y}px`;
      if (!element.style.transform) element.style.transform = MARKER_BASE_TRANSFORM;
    }

    onRemove() {
      element.remove();
    }
  }

  const overlay = new MarkerOverlay();
  overlay.setMap(map);
  return overlay;
}

type Props = TripMapProps & { onError: (error: MapLoadError) => void };

/** 해외 여행용 지도. Kakao 로는 한국 밖을 보여 줄 수 없어 여기만 Google 을 쓴다. */
export function GoogleTripMap({
  points,
  selectedId,
  recenter,
  onSelect,
  initialCenter,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<Array<google.maps.OverlayView | google.maps.Polyline>>([]);
  /** 선택이 바뀔 때마다 마커를 다시 그리지 않으려고 DOM 을 들고 있는다. */
  const markersRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const [maps, setMaps] = useState<GoogleMapsLibraries | null>(null);

  // 콜백은 ref 로 받는다. 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다
  // 마커를 전부 다시 만들고 fitBounds 가 함께 돌아 지도가 튄다.
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onErrorRef.current = onError;
  }, [onSelect, onError]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)
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

  // 인증 실패는 로드 Promise 밖에서 온다. 구독하지 않으면 회색 타일 위에
  // Google 자체 오버레이만 남아 사용자도 개발자도 원인을 알 수 없다.
  useEffect(
    () =>
      onMapAuthFailure((errorName) =>
        onErrorRef.current(
          new MapLoadError("Google Maps 인증에 실패했습니다.", "auth", errorName ?? undefined),
        ),
      ),
    [],
  );

  useEffect(() => {
    if (!maps || !containerRef.current) return;

    if (!mapRef.current) {
      mapRef.current = new maps.Map(containerRef.current, {
        center: initialCenter
          ? { lat: initialCenter.latitude, lng: initialCenter.longitude }
          : FALLBACK_CENTER,
        zoom: initialCenter ? 10 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
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

      element.style.zIndex = String(10 + point.order);
      overlaysRef.current.push(createMarkerOverlay(maps, map, position, element));
    }

    for (const [dayIndex, dayPoints] of groupByDay(points)) {
      if (dayPoints.length < 2) continue;
      const line = new maps.Polyline({
        path: dayPoints.map((p) => new maps.LatLng(p.latitude, p.longitude)),
        strokeWeight: 3,
        strokeColor: dayColor(dayIndex),
        strokeOpacity: 0.8,
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    map.fitBounds(bounds, 48);
  }, [maps, points, initialCenter]);

  // 선택 반영은 마커를 다시 만들지 않는다. 다시 만들면 fitBounds 가 함께 돌아
  // 항목을 누를 때마다 지도 축척이 튄다.
  useEffect(() => {
    for (const [id, element] of markersRef.current) {
      applyMarkerSelection(element, id === selectedId, MARKER_BASE_TRANSFORM);
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
      data-map-provider="google"
      role="application"
      aria-label="여행 일정 지도"
      className="size-full min-h-64 rounded-xl border border-border bg-muted"
    />
  );
}
