/**
 * PostgREST / Postgres 오류를 사용자에게 보여 줄 한국어 문장으로 바꾼다.
 *
 * 오류 원문(`error.message`)은 영어이고 제약·함수 이름 같은 내부 구조가 드러난다.
 * 화면에는 "무엇을 하지 못했는지 + 왜(알 수 있으면)" 만 보여 주고 원문은 버린다.
 */
export type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined;

const CONSTRAINT_MESSAGES: ReadonlyArray<[RegExp, string]> = [
  [/itinerary_items_time_range/, "종료 시각은 시작 시각 이후여야 합니다."],
  [/trips_date_range/, "종료일은 시작일과 같거나 이후여야 합니다."],
  [/last owner/i, "마지막 소유자입니다. 다른 사람을 소유자로 지정한 뒤에 바꿀 수 있습니다."],
  [/anchor item .* not on the same day/i, "기준 일정이 그새 바뀌었습니다. 새로고침 후 다시 시도하세요."],
];

const CODE_MESSAGES: Record<string, string> = {
  "23505": "이미 같은 항목이 있습니다.",
  "23503": "연결된 항목을 찾을 수 없습니다. 새로고침 후 다시 시도하세요.",
  "23514": "입력값이 허용 범위를 벗어났습니다.",
  "23502": "필수 입력이 비어 있습니다.",
  "22001": "입력이 너무 깁니다.",
  "22007": "날짜·시각 형식이 올바르지 않습니다.",
  "22008": "날짜·시각이 허용 범위를 벗어났습니다.",
  "22P02": "입력 형식이 올바르지 않습니다.",
  "22023": "요청 값이 올바르지 않습니다. 새로고침 후 다시 시도하세요.",
  "42501": "권한이 없습니다.",
  P0002: "대상을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.",
  PGRST116: "대상을 찾을 수 없습니다.",
  PGRST301: "로그인이 만료됐습니다. 다시 로그인하세요.",
  PGRST303: "로그인이 만료됐습니다. 다시 로그인하세요.",
  "40001": "동시에 저장이 겹쳤습니다. 다시 시도하세요.",
  "40P01": "동시에 저장이 겹쳤습니다. 다시 시도하세요.",
  "57014": "처리 시간이 너무 오래 걸렸습니다. 다시 시도하세요.",
};

/** 원인 문장만. 알 수 없으면 일반 문장. */
export function dbErrorReason(error: DbErrorLike): string {
  const message = error?.message ?? "";
  for (const [pattern, text] of CONSTRAINT_MESSAGES) {
    if (pattern.test(message)) return text;
  }
  const code = error?.code ?? "";
  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  if (/fetch failed|network|ECONN|ETIMEDOUT/i.test(message)) {
    return "서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.";
  }
  return "잠시 후 다시 시도하세요.";
}

/** "일정을 추가하지 못했습니다. 종료 시각은 …" 처럼 무엇을 못 했는지와 원인을 붙인다. */
export function dbErrorMessage(action: string, error: DbErrorLike): string {
  return `${action}. ${dbErrorReason(error)}`;
}
