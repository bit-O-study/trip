export type MapPoint = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  /** 0-based. 색상을 정한다. */
  dayIndex: number;
  /** 그 날의 방문 순번 (1-based) */
  order: number;
  /** 음식점 후보처럼 지도 위에 직접 보여 줄 요약. */
  badgeLabel?: string;
  /** 휴무처럼 강조할 짧은 경고. */
  warning?: string;
};

export type TripMapProps = {
  points: MapPoint[];
  /** 지도 높이. 모바일 바텀시트로 바뀌면 조정한다. */
  className?: string;
  /** 타임라인과 공유하는 선택 항목 */
  selectedId?: string | null;
  /** 선택한 항목으로 지도를 옮길지. 지도에서 시작한 선택이면 옮기지 않는다. */
  recenter?: boolean;
  onSelect?: (id: string) => void;
  initialCenter?: { latitude: number; longitude: number };
};
