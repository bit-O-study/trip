"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel?: string;
  className: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
};

export function DeleteSubmitButton({
  idleLabel,
  pendingLabel = "삭제 중…",
  className,
  disabled,
  ariaLabel,
  testId,
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-label={ariaLabel}
      aria-busy={pending}
      data-testid={testId}
      className={className}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
