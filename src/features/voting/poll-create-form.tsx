"use client";

import { useActionState } from "react";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { createRestaurantPollAction } from "@/features/voting/actions";
import { PollSubmitButton } from "@/features/voting/poll-submit-button";
import { openDatePicker } from "@/lib/date-picker";

type Props = { tripId: string; defaultDate: string; timezone: string };

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p role="alert" className="text-sm text-danger">{errors[0]}</p>;
}

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2";

/**
 * 투표 만들기 폼.
 *
 * 클라이언트 컴포넌트인 이유는 검증 실패를 폼 안에 보여 주기 위해서다.
 * 서버 액션이 그냥 throw 하면 Next 오류 화면으로 튕겨 나가 사용자는 무엇이
 * 잘못됐는지도, 방금 입력한 값도 잃는다.
 */
export function PollCreateForm({ tripId, defaultDate, timezone }: Props) {
  const [state, action] = useActionState<ActionState, FormData>(createRestaurantPollAction, IDLE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="tripId" value={tripId} />
      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium">투표 제목</span>
        <input name="title" required maxLength={120} placeholder="첫날 점심 투표" className={FIELD} />
        <FieldError errors={errors.title} />
      </label>
      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium">검색할 위치</span>
        <input name="location" required maxLength={120} placeholder="제주 연동" className={FIELD} />
        <FieldError errors={errors.location} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">일정 시각</span>
        <input
          type="datetime-local"
          name="scheduledLocal"
          onClick={openDatePicker}
          required
          defaultValue={`${defaultDate}T12:00`}
          className={FIELD}
        />
        <FieldError errors={errors.scheduledLocal} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium">투표 종료 시각</span>
        <input
          type="datetime-local"
          name="closesLocal"
          onClick={openDatePicker}
          required
          defaultValue={`${defaultDate}T10:00`}
          className={FIELD}
        />
        <FieldError errors={errors.closesLocal} />
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        시간대: {timezone} · 종료 시각은 지금 이후이면서 식사 시각보다 빨라야 합니다.
      </p>
      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm text-danger sm:col-span-2">{state.message}</p>
      ) : null}
      <PollSubmitButton />
    </form>
  );
}
