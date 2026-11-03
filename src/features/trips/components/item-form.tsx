"use client";

import { useActionState, useState } from "react";

import { IDLE, valueOr, type ActionState } from "@/features/trips/action-state";
import { useToast } from "@/components/ui/toast";
import { createItemAction } from "@/features/trips/actions";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@/features/trips/types";
import { openDatePicker } from "@/lib/date-picker";

type Props = {
  tripId: string;
  /** 기본 날짜 ("2026-02-14"). 지금 보고 있는 Day 를 넣는다. */
  defaultDate: string;
  /** 시작 시각 기본값("HH:MM"). 그날 마지막 일정이 끝나는 시각을 넣어 주면 연달아 추가할 때 순서가 맞는다. */
  defaultTime?: string;
  timezone: string;
  defaultOpen?: boolean;
  onCancel?: () => void;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export function ItemForm({ tripId, defaultDate, defaultTime = "09:00", timezone, defaultOpen = false, onCancel }: Props) {
  const [type, setType] = useState<ItemType>("activity");
  const [open, setOpen] = useState(defaultOpen);
  const toast = useToast();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (previous, formData) => {
      const result = await createItemAction(previous, formData);
      if (result.status === "success") {
        // 성공하면 폼을 닫고 알린다. 열어 둔 채 입력만 비워지면 추가됐는지 알 수 없다.
        toast.show({ message: result.message ?? "일정을 추가했습니다." });
        if (onCancel) onCancel();
        else setOpen(false);
      }
      return result;
    },
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
          {ITEM_TYPES.map((itemType) => (
            <label
              key={itemType}
              className="cursor-pointer rounded-full border border-border bg-card px-3.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground"
            >
              <input
                type="radio"
                name="type"
                value={itemType}
                checked={type === itemType}
                onChange={() => setType(itemType)}
                className="sr-only"
              />
              {ITEM_TYPE_LABELS[itemType]}
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
          defaultValue={valueOr(state, "title", "")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <FieldError errors={errors.title} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="startLocal" className="text-sm font-medium">
            {type === "lodging" ? "체크인" : "시작"}
          </label>
          <input
            id="startLocal"
            name="startLocal"
            type="datetime-local"
            onClick={openDatePicker}
            required
            defaultValue={valueOr(state, "startLocal", `${defaultDate}T${defaultTime}`)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <FieldError errors={errors.startLocal} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endLocal" className="text-sm font-medium">
            {type === "lodging" ? "체크아웃" : <>종료 <span className="text-muted-foreground">(선택)</span></>}
          </label>
          <input
            id="endLocal"
            name="endLocal"
            required={type === "lodging"}
            type="datetime-local"
            onClick={openDatePicker}
            defaultValue={valueOr(state, "endLocal", "")}
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
        {/* 이 라벨은 실제로 선택 입력이어야 한다. 서버 스키마도 같은 규칙이다. */}
        <input
          id="locationText"
          name="locationText"
          maxLength={200}
          placeholder="신주쿠 3초메"
          defaultValue={valueOr(state, "locationText", "")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <p className="text-xs text-muted-foreground">
          지도에서 찾히면 위치가 자동으로 붙고, 못 찾아도 글자로 그대로 저장됩니다.
          정확한 좌표가 필요하면 위의 장소 검색을 쓰세요.
        </p>
        <FieldError errors={errors.locationText} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="item-note" className="text-sm font-medium">
          메모 <span className="text-muted-foreground">(선택)</span>
        </label>
        <textarea
          id="item-note"
          name="note"
          maxLength={2000}
          placeholder="예약번호, 준비물, 가는 길 안내…"
          defaultValue={valueOr(state, "note", "")}
          className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <FieldError errors={errors.note} />
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
          className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          추가
        </button>
        <button
          type="button"
          onClick={() => {
            if (!onCancel) setOpen(false);
            onCancel?.();
          }}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          취소
        </button>
      </div>
    </form>
  );
}
