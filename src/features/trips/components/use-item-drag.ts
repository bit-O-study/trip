"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { useToast } from "@/components/ui/toast";
import { moveItemAfterAction, moveItemDownAction, moveItemToDayAction, moveItemUpAction } from "@/features/trips/actions";
import type { MoveResult } from "@/features/trips/reorder";
import { reportMove } from "./move-feedback";

/** 휴대폰에서 "꾹 눌렀다" 고 인정하는 시간. 이보다 짧게 움직이면 스크롤이다. */
const LONG_PRESS_MS = 380;
/** 누른 채 이만큼 움직이면 꾹 누르기가 아니라 스크롤 의도로 본다. */
const MOVE_TOLERANCE = 8;

type Gesture = {
  x: number;
  y: number;
  active: boolean;
  target: HTMLElement | null;
  before: boolean;
  touch: boolean;
  pointerId: number;
  element: HTMLElement;
  timer: number;
};

export function useItemDrag(tripId: string, itemId: string, enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const toast = useToast();
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef<number>(0);
  const pointerY = useRef(0);
  const pointerX = useRef(0);

  /** 드래그가 시작된 뒤에는 브라우저의 스크롤이 손가락을 가져가지 못하게 막는다. */
  const blockTouchScroll = useRef((event: TouchEvent) => {
    if (event.cancelable) event.preventDefault();
  });

  function stopBlockingScroll() {
    window.removeEventListener("touchmove", blockTouchScroll.current);
  }

  useEffect(() => {
    const block = blockTouchScroll.current;
    return () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(gesture.current?.timer);
      window.removeEventListener("touchmove", block);
      gesture.current?.target?.removeAttribute("data-drop-position");
    };
  }, []);

  function save(action: (data: FormData) => Promise<MoveResult>, extra: Record<string, string> = {}) {
    const data = new FormData();
    Object.entries({ tripId, itemId, ...extra }).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      try {
        const result = await action(data);
        setMessage(reportMove(result, { tripId, itemId, show: toast.show }));
      } catch {
        setMessage("이동하지 못했습니다. 다시 시도하세요.");
        toast.show({ message: "이동하지 못했습니다. 다시 시도하세요.", tone: "error" });
      }
    });
  }

  function clear() {
    cancelAnimationFrame(frame.current);
    window.clearTimeout(gesture.current?.timer);
    stopBlockingScroll();
    gesture.current?.target?.removeAttribute("data-drop-position");
    gesture.current = null;
    setDragging(false);
    setPressing(false);
  }

  function autoScroll() {
    const y = pointerY.current;
    const delta = y < 80 ? -12 : y > window.innerHeight - 80 ? 12 : 0;
    if (delta) window.scrollBy(0, delta);
    updateTarget();
    frame.current = requestAnimationFrame(autoScroll);
  }

  function updateTarget() {
    const current = gesture.current;
    if (!current?.active) return;
    const hit = document.elementFromPoint(pointerX.current, pointerY.current);
    const target = hit?.closest<HTMLElement>("[data-drag-item], [data-drop-day]") ?? null;
    current.target?.removeAttribute("data-drop-position");
    current.target = target?.dataset.tripId === tripId && target.dataset.dragItem !== itemId ? target : null;
    if (current.target) {
      const rect = current.target.getBoundingClientRect();
      current.before = pointerY.current < rect.top + rect.height / 2;
      current.target.setAttribute("data-drop-position", current.before ? "before" : "after");
    }
  }

  function activate(current: Gesture) {
    current.active = true;
    suppressClick.current = true;
    try {
      current.element.setPointerCapture(current.pointerId);
    } catch {
      /* 이미 놓인 포인터면 무시 */
    }
    if (current.touch) {
      window.addEventListener("touchmove", blockTouchScroll.current, { passive: false });
      // 꾹 눌려 들어 올려졌다는 촉각 신호. 지원하지 않는 기기는 조용히 넘어간다.
      try { navigator.vibrate?.(12); } catch { /* noop */ }
    }
    setPressing(false);
    setDragging(true);
    setMessage("놓을 위치로 끌어 주세요.");
    frame.current = requestAnimationFrame(autoScroll);
  }

  return {
    dragging, pressing, pending, message,
    onPointerDown(event: PointerEvent<HTMLLIElement>) {
      suppressClick.current = false;
      if (!enabled || pending || event.button !== 0) return;
      const control = (event.target as HTMLElement).closest("button, input, select, textarea, a, form, details, summary");
      if (control && !control.hasAttribute("data-select-item")) return;
      const touch = event.pointerType === "touch" || event.pointerType === "pen";
      const current: Gesture = {
        x: event.clientX, y: event.clientY, active: false, target: null, before: false,
        touch, pointerId: event.pointerId, element: event.currentTarget, timer: 0,
      };
      gesture.current = current;
      pointerX.current = event.clientX;
      pointerY.current = event.clientY;
      if (touch) {
        // 손가락은 꾹 누르고 있어야 일정이 들어 올려진다. 그 전에는 평범한 스크롤이다.
        setPressing(true);
        current.timer = window.setTimeout(() => {
          if (gesture.current === current && !current.active) activate(current);
        }, LONG_PRESS_MS);
      }
    },
    onPointerMove(event: PointerEvent<HTMLLIElement>) {
      const current = gesture.current;
      if (!current) return;
      pointerY.current = event.clientY;
      pointerX.current = event.clientX;
      const moved = Math.hypot(event.clientX - current.x, event.clientY - current.y);
      if (!current.active) {
        if (moved < MOVE_TOLERANCE) return;
        if (current.touch) {
          // 꾹 누르기 전에 움직였다 → 스크롤하려는 것. 이 제스처는 포기한다.
          clear();
          return;
        }
        activate(current); // 마우스는 8px 움직이면 바로 끌기
      }
      updateTarget();
    },
    onPointerUp(event: PointerEvent<HTMLLIElement>) {
      const current = gesture.current;
      if (current?.active && current.target) {
        if (current.target.dataset.dragItem) save(moveItemAfterAction, { targetId: current.target.dataset.dragItem, position: current.before ? "before" : "after" });
        else if (current.target.dataset.dropDay) save(moveItemToDayAction, { date: current.target.dataset.dropDay });
      }
      if (current?.active && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      clear();
    },
    onPointerCancel: clear,
    onContextMenu(event: React.MouseEvent) {
      // 꾹 누르면 뜨는 브라우저 메뉴가 끌기를 방해한다.
      if (gesture.current?.touch) event.preventDefault();
    },
    onClickCapture(event: React.MouseEvent) {
      if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
    },
    onKeyDown(event: React.KeyboardEvent) {
      if (event.key === "Escape") { clear(); return; }
      if (!enabled || pending || !event.altKey || event.target !== event.currentTarget) return;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        save(event.key === "ArrowUp" ? moveItemUpAction : moveItemDownAction);
      }
    },
  };
}
