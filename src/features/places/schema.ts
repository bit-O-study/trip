import { z } from "zod";
import { PLACE_CATEGORY_GROUPS } from "./types";

// 수정에서도 사용자가 고른 좌표를 저장하고 외부 검색을 반복하지 않는다.
export const selectedPlaceSchema = z.object({
  provider: z.enum(["google", "kakao"]),
  providerPlaceId: z.string().trim().min(1).max(300),
  name: z.string().trim().min(1).max(200),
  categoryGroup: z.enum(PLACE_CATEGORY_GROUPS),
  category: z.string().max(200).nullable(),
  address: z.string().max(300).nullable(),
  roadAddress: z.string().max(300).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
