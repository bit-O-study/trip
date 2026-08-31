"use client";

import { useFormStatus } from "react-dom";

export function PollSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-wait disabled:opacity-50 sm:col-span-2">
      {pending ? "투표 만드는 중…" : "투표 만들기"}
    </button>
  );
}
