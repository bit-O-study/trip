import { z } from "zod";

import { ITEM_TYPES } from "@/features/trips/types";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
  // 2월 30일처럼 달력에 없는 날은 Date 가 다음 달로 넘겨 버린다. 되돌려 비교한다.
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
  }, "존재하지 않는 날짜입니다")
  .refine((value) => value >= "1900-01-01" && value <= "2199-12-31", "날짜를 확인하세요");

/** 여행 기간 상한. 날짜마다 화면을 그리므로 수천 년짜리 여행은 페이지를 멈춘다. */
export const MAX_TRIP_DAYS = 366;

function daySpan(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000;
}

/**
 * IANA 시간대 이름 검증.
 *
 * 목록을 하드코딩하지 않고 런타임에 물어본다. 목록은 계속 늘어나고,
 * 잘못된 값이 저장되면 그 여행의 모든 시각 표시가 조용히 틀어진다.
 */
const timezone = z.string().refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: "알 수 없는 시간대입니다" },
);

export const tripFormSchema = z
  .object({
    title: z.string().trim().min(1, "여행 이름을 입력하세요").max(120, "여행 이름은 120자 이내로 입력하세요"),
    destinationName: z.string().trim().max(120, "도시는 120자 이내로 입력하세요").optional().or(z.literal("")),
    startDate: dateOnly,
    endDate: dateOnly,
    timezone,
    baseCurrency: z
      .string()
      .trim()
      .length(3, "통화 코드는 3자입니다")
      .transform((value) => value.toUpperCase()),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: "종료일은 시작일과 같거나 이후여야 합니다",
    // 날짜 문자열이 YYYY-MM-DD 라 사전순 비교가 곧 시간순 비교다.
    path: ["endDate"],
  })
  .refine((value) => daySpan(value.startDate, value.endDate) < MAX_TRIP_DAYS, {
    message: `여행 기간은 ${MAX_TRIP_DAYS}일을 넘을 수 없습니다`,
    path: ["endDate"],
  });

export type TripFormValues = z.infer<typeof tripFormSchema>;

export const itemFormSchema = z
  .object({
    tripId: z.uuid("올바르지 않은 여행입니다"),
    type: z.enum(ITEM_TYPES),
    title: z.string().trim().min(1, "제목을 입력하세요").max(200, "제목은 200자 이내로 입력하세요"),
    /** 여행 시간대 기준의 로컬 입력값. "2026-02-14T08:20" */
    startLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "날짜와 시각을 입력하세요"),
    endLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    /*
     * 장소는 선택 입력이다.
     *
     * 필수로 두면 "공항 3층 만남의 광장" 처럼 지도에 없는 약속이나 메모성
     * 일정을 아예 못 만든다. 좌표는 붙으면 좋은 것이지 저장의 조건이 아니다
     * (docs/architecture.md 의 degraded mode 정책).
     */
    locationText: z.string().trim().max(200, "장소는 200자 이내로 입력하세요").optional().or(z.literal("")),
    note: z.string().trim().max(2000, "메모는 2000자 이내로 입력하세요").optional().or(z.literal("")),
  })
  .refine((value) => value.type !== "lodging" || Boolean(value.endLocal && value.endLocal > value.startLocal), { message: "체크아웃은 체크인 이후로 입력하세요", path: ["endLocal"] })
  .refine((value) => !value.endLocal || value.endLocal >= value.startLocal, {
    message: "종료 시각은 시작 시각 이후여야 합니다",
    path: ["endLocal"],
  });

export type ItemFormValues = z.infer<typeof itemFormSchema>;

/** 낙관적 잠금에 쓰는 기대 updated_at */
export const expectedUpdatedAt = z.iso.datetime({ offset: true });
