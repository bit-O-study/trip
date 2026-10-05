"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { moveItemAfterAction, moveItemDownAction, moveItemToDayAction, moveItemUpAction } from "@/features/trips/actions";

export function useItemDrag(tripId: string, itemId: string, enabled: boolean) {
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const gesture = useRef<{ x: number; y: number; started: number; scrolling: boolean; active: boolean; target: HTMLElement | null; before: boolean } | null>(null);
  const suppressClick = useRef(false);
  const frame = useRef<number>(0);
  const pointerY = useRef(0);
  const pointerX = useRef(0);

  useEffect(() => () => {
    cancelAnimationFrame(frame.current);
    gesture.current?.target?.removeAttribute("data-drop-position");
  }, []);

  function save(action: (data: FormData) => Promise<void>, extra: Record<string, string> = {}) {
    const data = new FormData();
    Object.entries({ tripId, itemId, ...extra }).forEach(([key, value]) => data.set(key, value));
    startTransition(async () => {
      try { await action(data); setMessage("일정을 이동했습니다."); }
      catch { setMessage("이동하지 못했습니다. 다시 시도하세요."); }
    });
  }

  function clear() {
    cancelAnimationFrame(frame.current);
    gesture.current?.target?.removeAttribute("data-drop-position");
    gesture.current = null;
    setDragging(false);
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

  return {
    dragging, pending, message,
    onPointerDown(event: PointerEvent<HTMLLIElement>) {
      suppressClick.current = false;
      if (!enabled || pending || event.button !== 0) return;
      const control = (event.target as HTMLElement).closest("button, input, select, textarea, a, form, details, summary");
      if (control && !control.hasAttribute("data-select-item")) return;
      gesture.current = { x: event.clientX, y: event.clientY, started: performance.now(), scrolling: false, active: false, target: null, before: false };
    },
    onPointerMove(event: PointerEvent<HTMLLIElement>) {
      const current = gesture.current;
      if (!current) return;
      pointerY.current = event.clientY;
      pointerX.current = event.clientX;
      // 휴대폰에서는 빠른 쓸기는 스크롤, 길게 누른 뒤 움직이면 일정 이동이다.
      if (current.scrolling || (!current.active && event.pointerType === "touch" && performance.now() - current.started < 220 && Math.abs(event.clientY - current.y) >= 8)) {
        current.scrolling = true;
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        window.scrollBy(0, current.y - event.clientY);
        current.y = event.clientY;
        return;
      }
      if (!current.active) {
        if (Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        current.active = true;
        suppressClick.current = true;
        setDragging(true);
        setMessage("놓을 위치로 끌어 주세요.");
        frame.current = requestAnimationFrame(autoScroll);
      }
      updateTarget();
    },
    onPointerUp(event: PointerEvent<HTMLLIElement>) {
      const current = gesture.current;
      if (current?.active && current.target) {
        if (current.target.dataset.dragItem) save(moveItemAfterAction, { targetId: current.target.dataset.dragItem, position: current.before ? "before" : "after" });
        else if (current.target.dataset.dropDay) save(moveItemToDayAction, { date: current.target.dataset.dropDay });
      }
      if ((current?.active || current?.scrolling) && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      clear();
    },
    onPointerCancel: clear,
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
