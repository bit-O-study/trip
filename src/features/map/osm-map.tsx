"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngBounds, Map as LeafletMap, Marker, Polyline } from "leaflet";
import "leaflet/dist/leaflet.css";

import { dayColor } from "@/lib/day-color";

import { MapLoadError } from "./errors";
import { applyMarkerSelection, groupByDay, markerButton } from "./marker";
import type { TripMapProps } from "./types";
import { mapContentKey, mapGeometryKey } from "./update-key";

/** 서울시청. 좌표가 하나도 없을 때의 기본 중심. */
const FALLBACK_CENTER: [number, number] = [37.5665, 126.978];

/** 마커 요소가 스스로 중심을 잡는다(Google 오버레이와 같은 방식). */
const MARKER_BASE_TRANSFORM = "translate(-50%, -50%)";

type Props = TripMapProps & { onError: (error: MapLoadError) => void };

/**
 * OpenStreetMap 지도(Leaflet). 키·결제·도메인 등록이 필요 없다.
 *
 * Kakao 는 사이트 도메인 등록, Google 은 결제 계정이 있어야 뜬다. 둘 중 하나라도 막히면
 * 지도가 통째로 사라지므로, 그럴 때 자동으로 이 지도로 넘어온다(trip-map.tsx).
 * 타일은 OSM 공개 서버(tile.openstreetmap.org)를 쓴다 — 소규모 개인·팀 용도 기준이며
 * 사용자가 크게 늘면 전용 타일 서비스로 바꿔야 한다. 출처 표기는 지도 오른쪽 아래에 항상 남긴다.
 */
export function OsmTripMap({ points, selectedId, recenter, onSelect, initialCenter, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const layersRef = useRef<Array<Marker | Polyline>>([]);
  const markersRef = useRef(new Map<string, HTMLElement>());
  const positionsRef = useRef(new Map<string, [number, number]>());
  const contentKeyRef = useRef<string | null>(null);
  const geometryKeyRef = useRef<string | null>(null);
  const initialCenterRef = useRef(initialCenter);
  const [ready, setReady] = useState(false);

  // 콜백은 ref 로 받는다. 의존성에 넣으면 부모가 인라인 함수를 넘길 때마다 마커를 다시 만들고 지도가 튄다.
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSelectRef.current = onSelect;
    onErrorRef.current = onError;
  }, [onSelect, onError]);

  // 지도를 한 번 만든다. Leaflet 은 window 가 있어야 하므로 브라우저에서만 불러온다.
  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        leafletRef.current = L;
        const center = initialCenterRef.current;
        const map = L.map(containerRef.current, {
          center: center ? [center.latitude, center.longitude] : FALLBACK_CENTER,
          zoom: center ? 10 : 12,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        }).addTo(map);
        mapRef.current = map;
        contentKeyRef.current = null;
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) onErrorRef.current(new MapLoadError("지도를 불러오지 못했습니다.", "network"));
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = [];
      markersRef.current.clear();
      positionsRef.current.clear();
      contentKeyRef.current = null;
      geometryKeyRef.current = null;
    };
  }, []);

  // 마커·선. 내용이 바뀔 때만 다시 그린다.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;

    const contentKey = mapContentKey(points);
    if (contentKeyRef.current === contentKey) return;
    contentKeyRef.current = contentKey;
    const geometryKey = mapGeometryKey(points);
    const geometryChanged = geometryKeyRef.current !== geometryKey;
    geometryKeyRef.current = geometryKey;

    for (const layer of layersRef.current) layer.remove();
    layersRef.current = [];
    markersRef.current = new Map();
    positionsRef.current = new Map();
    if (points.length === 0) return;

    const bounds: LatLngBounds = L.latLngBounds([]);
    for (const point of points) {
      const latLng: [number, number] = [point.latitude, point.longitude];
      bounds.extend(latLng);
      const element = markerButton(point, (id) => onSelectRef.current?.(id));
      markersRef.current.set(point.id, element);
      positionsRef.current.set(point.id, latLng);
      const marker = L.marker(latLng, {
        icon: L.divIcon({ html: element, className: "", iconSize: [0, 0], iconAnchor: [0, 0] }),
        keyboard: false,
      });
      marker.addTo(map);
      layersRef.current.push(marker);
    }

    // 점선: 화면 아래 설명이 "점선은 방문 순서" 라고 약속한다.
    for (const [dayIndex, dayPoints] of groupByDay(points)) {
      if (dayPoints.length < 2) continue;
      const line = L.polyline(
        dayPoints.map((p) => [p.latitude, p.longitude] as [number, number]),
        { color: dayColor(dayIndex), weight: 3, opacity: 0.8, dashArray: "2 8", lineCap: "round" },
      );
      line.addTo(map);
      layersRef.current.push(line);
    }

    if (geometryChanged) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }, [ready, points]);

  // 선택 반영은 마커를 다시 만들지 않는다.
  useEffect(() => {
    for (const [id, element] of markersRef.current) {
      applyMarkerSelection(element, id === selectedId, MARKER_BASE_TRANSFORM);
    }
    if (!recenter || !selectedId || !mapRef.current) return;
    const position = positionsRef.current.get(selectedId);
    if (position) mapRef.current.panTo(position);
  }, [selectedId, recenter, points, ready]);

  return (
    <div
      ref={containerRef}
      data-testid="trip-map"
      data-map-provider="osm"
      role="application"
      aria-label="여행 일정 지도"
      className="size-full min-h-64 rounded-xl border border-border bg-muted"
    />
  );
}
