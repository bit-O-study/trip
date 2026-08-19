/**
 * 서버 액션의 반환 타입.
 *
 * actions.ts 는 "use server" 파일이라 async 함수 외의 값을 export 할 수 없다.
 * 상수와 헬퍼는 여기에 둔다.
 */
export type ActionState = {
  status: "idle" | "error";
  message?: string;
  /** 필드별 오류. 폼이 각 입력 아래에 표시한다. */
  fieldErrors?: Record<string, string[]>;
};

export const IDLE: ActionState = { status: "idle" };

export function fail(
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionState {
  return { status: "error", message, fieldErrors };
}
