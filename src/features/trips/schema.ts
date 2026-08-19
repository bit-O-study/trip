import { z } from "zod";

import { ITEM_TYPES } from "@/features/trips/types";

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다");

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
    title: z.string().trim().min(1, "여행 이름을 입력하세요").max(120),
    destinationName: z.string().trim().max(120).optional().or(z.literal("")),
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
  });

export type TripFormValues = z.infer<typeof tripFormSchema>;

export const itemFormSchema = z
  .object({
    tripId: z.uuid(),
    type: z.enum(ITEM_TYPES),
    title: z.string().trim().min(1, "제목을 입력하세요").max(200),
    /** 여행 시간대 기준의 로컬 입력값. "2026-02-14T08:20" */
    startLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "날짜와 시각을 입력하세요"),
    endLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional()
      .or(z.literal("")),
    locationText: z.string().trim().max(200).optional().or(z.literal("")),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((value) => !value.endLocal || value.endLocal >= value.startLocal, {
    message: "종료 시각은 시작 시각 이후여야 합니다",
    path: ["endLocal"],
  });

export type ItemFormValues = z.infer<typeof itemFormSchema>;

/** 낙관적 잠금에 쓰는 기대 updated_at */
export const expectedUpdatedAt = z.iso.datetime({ offset: true });
