"use client";

import { createContext, useContext, useMemo, useState } from "react";

import { deleteItemsAction } from "@/features/trips/actions";
import { DeleteSubmitButton } from "@/features/trips/components/delete-submit-button";

type SelectionContextValue = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
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
    }),
    [activeSelected],
  );

  const allSelected = itemIds.length > 0 && activeSelected.size === itemIds.length;

  return (
    <SelectionContext.Provider value={value}>
      {itemIds.length > 0 ? (
        <form
          action={deleteItemsAction}
          onSubmit={(event) => {
            if (!window.confirm(`선택한 일정 ${activeSelected.size}개를 삭제하시겠습니까?`)) {
              event.preventDefault();
            }
          }}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
        >
          <input type="hidden" name="tripId" value={tripId} />
          {[...activeSelected].map((id) => <input key={id} type="hidden" name="itemId" value={id} />)}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(itemIds))}
            />
            전체 선택
          </label>
          <span className="text-sm text-muted-foreground">{activeSelected.size}개 선택</span>
          <DeleteSubmitButton
            idleLabel="선택 일정 삭제"
            pendingLabel="일괄 삭제 중…"
            disabled={activeSelected.size === 0}
            className="ml-auto rounded-lg border border-danger px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
          />
        </form>
      ) : null}
      {children}
    </SelectionContext.Provider>
  );
}
