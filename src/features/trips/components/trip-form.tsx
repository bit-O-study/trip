"use client";

import { useActionState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { openDatePicker } from "@/lib/date-picker";

/**
 * 자주 쓰는 시간대. 목록에 없으면 직접 입력할 수 있게 datalist 로 둔다.
 * 검증은 서버가 Intl 로 한다 — 목록을 하드코딩해 두면 계속 낡는다.
 */
const COMMON_TIMEZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Hong_Kong",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Asia/Ho_Chi_Minh",
  "Asia/Manila",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "Pacific/Guam",
  "UTC",
];

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  defaults?: {
    tripId?: string;
    expectedUpdatedAt?: string;
    title?: string;
    destinationName?: string;
    startDate?: string;
    endDate?: string;
    timezone?: string;
    baseCurrency?: string;
  };
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export function TripForm({ action, submitLabel, defaults }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      {defaults?.tripId ? <input type="hidden" name="tripId" value={defaults.tripId} /> : null}
      {defaults?.expectedUpdatedAt ? (
        <input type="hidden" name="expectedUpdatedAt" value={defaults.expectedUpdatedAt} />
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          여행 이름
        </label>
        <input
          id="title"
          name="title"
          required
          maxLength={120}
          defaultValue={defaults?.title}
          placeholder="도쿄 4박5일"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <FieldError errors={errors.title} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="destinationName" className="text-sm font-medium">
          도시 <span className="text-muted-foreground">(선택)</span>
        </label>
        <input
          id="destinationName"
          name="destinationName"
          maxLength={120}
          defaultValue={defaults?.destinationName}
          placeholder="도쿄"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
        />
        <FieldError errors={errors.destinationName} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="startDate" className="text-sm font-medium">
            시작일
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            onClick={openDatePicker}
            required
            defaultValue={defaults?.startDate}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <FieldError errors={errors.startDate} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endDate" className="text-sm font-medium">
            종료일
          </label>
          <input
            id="endDate"
            name="endDate"
            type="date"
            onClick={openDatePicker}
            required
            defaultValue={defaults?.endDate}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <FieldError errors={errors.endDate} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="timezone" className="text-sm font-medium">
            현지 시간대
          </label>
          <input
            id="timezone"
            name="timezone"
            list="timezone-options"
            required
            defaultValue={defaults?.timezone ?? "Asia/Seoul"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base"
          />
          <datalist id="timezone-options">
            {COMMON_TIMEZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">일정 시각을 이 시간대로 표시합니다.</p>
          <FieldError errors={errors.timezone} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="baseCurrency" className="text-sm font-medium">
            통화
          </label>
          <input
            id="baseCurrency"
            name="baseCurrency"
            maxLength={3}
            required
            defaultValue={defaults?.baseCurrency ?? "KRW"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base uppercase"
          />
          <FieldError errors={errors.baseCurrency} />
        </div>
      </div>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </form>
  );
}
