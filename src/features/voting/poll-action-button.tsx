"use client";

import { useFormStatus } from "react-dom";

export function PollActionButton({
  idleLabel,
  pendingLabel,
  className,
  ariaLabel,
}: {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={ariaLabel}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-50`}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
