"use client";

import { createContext, useActionState, useContext, useMemo, useState } from "react";
import { IDLE } from "@/features/trips/action-state";

import { useToast } from "@/components/ui/toast";
import { deleteItemsAction, restoreItemsAction } from "@/features/trips/actions";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";

type SelectionContextValue = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  tripId: string;
  itemIds: string[];
  setSelected: (ids: Set<string>) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useBulkItemSelection() {
  return useContext(SelectionContext);
}

type Props = {
  tripId: string;
  itemIds: string[];
  children: React.ReactNode;
};

export function BulkDeleteProvider({ tripId, itemIds, children }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const activeSelected = useMemo(() => {
    const available = new Set(itemIds);
    return new Set([...selected].filter((id) => available.has(id)));
  }, [itemIds, selected]);
  const value = useMemo<SelectionContextValue>(
    () => ({
      selected: activeSelected,
      toggle(id) {
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      },
      tripId,
      itemIds,
      setSelected,
    }),
    [activeSelected, itemIds, tripId],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function BulkDeleteToolbar() {
  const context = useBulkItemSelection();
  const toast = useToast();
  const setSelectedRef = context?.setSelected;
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof deleteItemsAction>[0], formData: FormData) => {
      const ids = formData.getAll("itemId").map(String);
      const tripIdValue = String(formData.get("tripId") ?? "");
      const result = await deleteItemsAction(previous, formData);
      if (result.status === "success") {
        // 확인창 대신 먼저 지우고 되돌릴 기회를 준다. 소프트 삭제라 복구할 수 있다.
        setSelectedRef?.(new Set());
        toast.show({
          message: result.message ?? "선택한 일정을 삭제했습니다.",
          actionLabel: "되돌리기",
          onAction: async () => {
            try {
              await restoreItemsAction(tripIdValue, ids);
              toast.show({ message: "일정을 되돌렸습니다." });
            } catch {
              toast.show({ message: "되돌리지 못했습니다. 다시 시도하세요.", tone: "error" });
            }
          },
        });
      }
      return result;
    },
    IDLE,
  );
  if (!context || context.itemIds.length === 0) return null;
  const { tripId, itemIds, selected, setSelected } = context;
  const allSelected = selected.size === itemIds.length;

  return (
        <form
          action={action}
          aria-busy={pending}
          className={`mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 ${selected.size > 0 ? "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 shadow-[var(--shadow-lift)] md:bottom-4" : ""}`}
        >
          <input type="hidden" name="tripId" value={tripId} />
          {[...selected].map((id) => <input key={id} type="hidden" name="itemId" value={id} />)}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={pending}
              onChange={() => setSelected(allSelected ? new Set() : new Set(itemIds))}
            />
            전체 선택
          </label>
          <span className="text-sm text-muted-foreground">{selected.size}개 선택</span>
          {state.message ? <p role={state.status === "error" ? "alert" : "status"} className="w-full text-sm">{state.message}</p> : null}
          <DeleteSubmitButton
            idleLabel="선택 일정 삭제"
            pendingLabel="일괄 삭제 중…"
            disabled={selected.size === 0}
            className="ml-auto rounded-full border border-danger px-4 py-1.5 text-sm font-medium text-danger hover:bg-danger hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          />
        </form>
  );
}
