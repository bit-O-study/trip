"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { TripMap, type MapPoint } from "@/features/map/trip-map";

/**
 * 타임라인 ↔ 지도 양방향 하이라이트.
 *
 * 이 앱의 정체성은 "일정과 지도가 같은 것을 가리킨다" 는 데 있다. 두 화면이
 * 별개 탭이면 동선이 물리적으로 말이 되는지 확인할 수 없다.
 *
 * 선택 상태는 서버가 아니라 여기 클라이언트에만 있다. URL 에 넣으면 항목을
 * 누를 때마다 서버 렌더가 돌고, 새로고침·뒤로가기 히스토리가 선택 이력으로
 * 더럽혀진다. 선택은 화면 상태이지 주소가 아니다.
 *
 * 타임라인은 서버 컴포넌트로 남기고 children 으로 받는다. 클라이언트 경계를
 * 지도와 선택 상태에만 두면 일정 목록은 계속 서버에서 렌더된다.
 */

type Origin = "map" | "timeline";

type SelectionValue = {
  selectedId: string | null;
  /** 선택을 시작한 쪽. 반대쪽만 따라 움직여야 스크롤이 서로를 밀지 않는다. */
  select: (id: string | null, origin: Origin) => void;
};

const SelectionContext = createContext<SelectionValue | null>(null);

/**
 * 타임라인 항목에서 쓴다. Provider 밖(예: 단위 테스트)에서는 아무것도 하지 않는
 * 값을 돌려준다 — 하이라이트가 없을 뿐 목록은 그대로 동작해야 한다.
 */
export function useItemSelection(): SelectionValue {
  return useContext(SelectionContext) ?? { selectedId: null, select: () => {} };
}

export function timelineItemDomId(itemId: string): string {
  return `item-${itemId}`;
}

type Props = {
  points: MapPoint[];
  mapClassName?: string;
  children: React.ReactNode;
};

export function TripBoard({ points, mapClassName, children }: Props) {
  const [selected, setSelected] = useState<{ id: string; origin: Origin } | null>(null);

  const select = useCallback((id: string | null, origin: Origin) => {
    setSelected((current) => {
      // 같은 항목을 다시 누르면 선택을 푼다. 하이라이트를 끄는 명시적 경로가
      // 없으면 한번 켜진 강조를 되돌릴 방법이 없다.
      if (id === null || current?.id === id) return null;
      return { id, origin };
    });
  }, []);

  // 지도에서 고른 항목을 타임라인에서 찾아 준다. 화면 밖에 있으면 강조해 봐야
  // 보이지 않는다.
  useEffect(() => {
    if (!selected || selected.origin !== "map") return;
    const element = document.getElementById(timelineItemDomId(selected.id));
    if (!element) return;

    // 포커스를 먼저 옮기고(스크롤은 막고) 위치는 직접 잡는다. 브라우저 기본
    // 포커스 스크롤은 항목을 화면 가장자리에 붙여 놓는다.
    const focusable = element.querySelector<HTMLElement>("[data-select-item]");
    focusable?.focus({ preventScroll: true });
    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected]);

  // Esc 로 선택 해제. 모달이 아니므로 포커스를 가두지 않는다.
  useEffect(() => {
    if (!selected) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  const value = useMemo<SelectionValue>(
    () => ({ selectedId: selected?.id ?? null, select }),
    [selected, select],
  );

  return (
    <SelectionContext.Provider value={value}>
      <TripMap
        points={points}
        className={mapClassName}
        selectedId={selected?.id ?? null}
        /* 지도가 이미 그 항목을 보여 주고 있으므로 지도 쪽에서 시작한 선택은
           지도를 다시 움직이지 않는다. */
        recenter={selected?.origin === "timeline"}
        onSelect={(id) => select(id, "map")}
      />
      {children}
    </SelectionContext.Provider>
  );
}
