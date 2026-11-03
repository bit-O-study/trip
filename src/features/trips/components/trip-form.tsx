"use client";

import { useActionState, useState } from "react";

import { IDLE, valueOr, type ActionState } from "@/features/trips/action-state";
import { openDatePicker } from "@/lib/date-picker";
import { tripDurationLabel } from "@/lib/datetime";

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
  const [startDate, setStartDate] = useState(defaults?.startDate ?? "");
  const [endDate, setEndDate] = useState(defaults?.endDate ?? "");
  const [timezone, setTimezone] = useState(defaults?.timezone ?? "Asia/Seoul");

  return (
    <form action={formAction} aria-busy={pending} className="space-y-5">
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
          defaultValue={valueOr(state, "title", defaults?.title)}
          placeholder="도쿄 4박5일"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
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
          defaultValue={valueOr(state, "destinationName", defaults?.destinationName)}
          placeholder="도쿄"
          className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
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
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
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
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
          />
          <FieldError errors={errors.endDate} />
        </div>
      </div>

      <p role="status" className="text-sm text-muted-foreground">
        {startDate && endDate ? (endDate < startDate ? "종료일은 시작일 이후로 선택해 주세요." : tripDurationLabel(startDate, endDate)) : "여행 기간을 선택해 주세요."}
      </p>

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
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
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
            defaultValue={valueOr(state, "baseCurrency", defaults?.baseCurrency ?? "KRW")}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base uppercase"
          />
          <FieldError errors={errors.baseCurrency} />
        </div>
      </div>

      {defaults?.tripId && timezone !== defaults.timezone ? (
        <fieldset className="space-y-3 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium">시간대 변경 시 기존 일정</legend>
          <p className="text-xs text-muted-foreground">시간대를 바꾸면 일정의 날짜와 표시 시각이 달라질 수 있습니다.</p>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="timezoneMode" value="instant" required className="mt-1" />실제 시각 유지 — 새 시간대에 맞춰 표시합니다.</label>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="timezoneMode" value="wall_clock" required className="mt-1" />현지 시각 유지 — 오전 10시 일정을 변경 후에도 오전 10시로 맞춥니다.</label>
          <FieldError errors={errors.timezoneMode} />
        </fieldset>
      ) : null}

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : null}
      {state.status === "success" && state.message ? (
        <p role="status" className="text-sm text-primary">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}
