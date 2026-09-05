"use client";

import { useFormStatus } from "react-dom";

type Props = {
  idleLabel: string;
  pendingLabel: string;
  className: string;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
};

/**
 * 서버 액션 폼의 제출 버튼.
 *
 * `useFormStatus` 는 폼 **안쪽** 컴포넌트에서만 값을 읽으므로 버튼을 따로
 * 떼어 둔다. 폼과 같은 컴포넌트에서 부르면 항상 pending=false 다.
 */
export function SubmitButton({
  idleLabel,
  pendingLabel,
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
