/**
 * 서버 액션의 반환 타입.
 *
 * actions.ts 는 "use server" 파일이라 async 함수 외의 값을 export 할 수 없다.
 * 상수와 헬퍼는 여기에 둔다.
 */
export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** 필드별 오류. 폼이 각 입력 아래에 표시한다. */
  fieldErrors?: Record<string, string[]>;
  /**
   * 실패했을 때 사용자가 제출한 값.
   *
   * React 19 는 `<form action>` 이 끝나면 비제어 입력을 defaultValue 로 되돌린다.
   * 검증에 실패했는데 입력이 전부 지워지면 처음부터 다시 써야 하므로, 폼은
   * defaultValue 를 이 값으로 바꿔 리셋이 "제출한 값" 으로 일어나게 한다.
   */
  values?: Record<string, string>;
};

export const IDLE: ActionState = { status: "idle" };

export function fail(
  message: string,
  fieldErrors?: Record<string, string[]>,
  values?: Record<string, string>,
): ActionState {
  return { status: "error", message, fieldErrors, values };
}

/** 폼이 보낸 문자열 값. 파일과 `$ACTION_` 같은 프레임워크 내부 필드는 뺀다. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  });
  return values;
}

/** 실패한 결과에만 제출 값을 붙인다. 성공하면 폼이 비워지는 게 맞다. */
export function withSubmittedValues(state: ActionState, formData: FormData): ActionState {
  return state.status === "error" ? { ...state, values: submittedValues(formData) } : state;
}

/** 실패 후 폼의 기본값. 제출 값이 있으면 그것, 없으면 원래 기본값. */
export function valueOr(state: ActionState, key: string, fallback: string | undefined): string | undefined {
  return state.status === "error" && state.values && key in state.values ? state.values[key] : fallback;
}
