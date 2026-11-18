import { z } from "zod";

export const PACKING_CATEGORIES = ["서류·결제", "의류", "세면·위생", "전자기기", "약·건강", "기타"];
export const packingSchema = z.object({
  title: z.string().trim().min(1).max(100), category: z.string().trim().min(1).max(30), checked: z.boolean(),
});
export type PackingItem = z.infer<typeof packingSchema> & { id: string; updated_at: string };

/** 대만 4박 5일 기본 목록. 11월 대만은 북부가 쌀쌀하고 비가 잦으며 전압은 110V(A형 플러그)다. */
export const TAIWAN_TEMPLATE: ReadonlyArray<{ title: string; category: string }> = [
  { title: "여권 (유효기간 확인)", category: "서류·결제" },
  { title: "항공권·숙소 예약 확인서", category: "서류·결제" },
  { title: "현금 (TWD 환전)", category: "서류·결제" },
  { title: "해외 결제 카드", category: "서류·결제" },
  { title: "교통카드 (EasyCard 등)", category: "서류·결제" },
  { title: "여행자 보험", category: "서류·결제" },
  { title: "얇은 겉옷 (북부 아침저녁 쌀쌀)", category: "의류" },
  { title: "편한 신발", category: "의류" },
  { title: "우산·우비 (비가 잦음)", category: "의류" },
  { title: "속옷·양말", category: "의류" },
  { title: "칫솔·치약", category: "세면·위생" },
  { title: "선크림", category: "세면·위생" },
  { title: "휴대용 휴지·물티슈", category: "세면·위생" },
  { title: "eSIM 설치·활성화 확인", category: "전자기기" },
  { title: "충전기·케이블", category: "전자기기" },
  { title: "보조배터리 (기내 휴대)", category: "전자기기" },
  { title: "멀티 어댑터 (대만 110V·A형)", category: "전자기기" },
  { title: "상비약 (소화제·진통제·밴드)", category: "약·건강" },
  { title: "개인 처방약", category: "약·건강" },
  { title: "에코백·접이식 가방", category: "기타" },
];

export function progress(items: PackingItem[]) {
  const done = items.filter(item => item.checked).length;
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 };
}

/** 분류별로 묶고, 기본 분류 순서를 먼저, 직접 만든 분류는 뒤에 둔다. */
export function groupByCategory(items: PackingItem[]): Array<[string, PackingItem[]]> {
  const groups = new Map<string, PackingItem[]>();
  for (const item of items) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  const rank = (name: string) => { const i = PACKING_CATEGORIES.indexOf(name); return i === -1 ? PACKING_CATEGORIES.length : i; };
  return [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}
