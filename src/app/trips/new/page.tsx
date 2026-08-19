import type { Metadata } from "next";

import { createTripAction } from "@/features/trips/actions";
import { TripForm } from "@/features/trips/components/trip-form";

export const metadata: Metadata = {
  title: "새 여행",
};

export default function NewTripPage() {
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">새 여행</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          이름과 기간을 정하면 날짜별 타임라인이 만들어집니다.
        </p>
      </div>

      <TripForm action={createTripAction} submitLabel="여행 만들기" />
    </div>
  );
}
