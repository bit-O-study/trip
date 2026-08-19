"use client";

import { useActionState, useState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { createItemAction } from "@/features/trips/actions";
import { ITEM_TYPES, ITEM_TYPE_ICONS, ITEM_TYPE_LABELS } from "@/features/trips/types";

type Props = {
  tripId: string;
  /** 기본 날짜 ("2026-02-14"). 지금 보고 있는 Day 를 넣는다. */
  defaultDate: string;
  timezone: string;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export function ItemForm({ tripId, defaultDate, timezone }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createItemAction,
    IDLE,
  );
  const errors = state.fieldErrors ?? {};

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-border px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        + 일정 추가
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="tripId" value={tripId} />

      <div className="space-y-1.5">
        <span className="text-sm font-medium">종류</span>
        <div className="flex flex-wrap gap-1.5">
          {ITEM_TYPES.map((type, index) => (
            <label
              key={type}
              className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input
                type="radio"
                name="type"
                value={type}
                defaultChecked={index === 3}
                className="sr-only"
              />
              <span aria-hidden>{ITEM_TYPE_ICONS[type]}</span> {ITEM_TYPE_LABELS[type]}
            </label>
          ))}
        </div>
        <FieldError errors={errors.type} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="item-title" className="text-sm font-medium">
          제목
        </label>
        <input
          id="item-title"
          name="title"
          required
          maxLength={200}
          placeholder="이치란 라멘"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <FieldError errors={errors.title} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="startLocal" className="text-sm font-medium">
            시작
          </label>
          <input
            id="startLocal"
            name="startLocal"
            type="datetime-local"
            required
            defaultValue={`${defaultDate}T09:00`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <FieldError errors={errors.startLocal} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endLocal" className="text-sm font-medium">
            종료 <span className="text-muted-foreground">(선택)</span>
          </label>
          <input
            id="endLocal"
            name="endLocal"
            type="datetime-local"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <FieldError errors={errors.endLocal} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">시각은 현지 시간({timezone}) 기준입니다.</p>

      <div className="space-y-1.5">
        <label htmlFor="locationText" className="text-sm font-medium">
          장소 <span className="text-muted-foreground">(선택)</span>
        </label>
        <input
          id="locationText"
          name="locationText"
          maxLength={200}
          placeholder="신주쿠 3초메"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <p className="text-xs text-muted-foreground">
          지도 검색으로 장소를 붙이는 기능은 5단계에서 추가됩니다.
        </p>
        <FieldError errors={errors.locationText} />
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          추가
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          취소
        </button>
      </div>
    </form>
  );
}
