export const ITEM_TYPES = [
  "flight",
  "lodging",
  "food",
  "activity",
  "transport",
  "memo",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  flight: "항공",
  lodging: "숙소",
  food: "맛집",
  activity: "일정",
  transport: "이동",
  memo: "메모",
};

export const ITEM_TYPE_ICONS: Record<ItemType, string> = {
  flight: "✈",
  lodging: "🏨",
  food: "🍜",
  activity: "📍",
  transport: "🚇",
  memo: "📝",
};

export type TripStatus = "planning" | "ongoing" | "completed";
export type TripRole = "owner" | "editor" | "viewer";
export type ItemStatus = "confirmed" | "tentative" | "candidate" | "cancelled";

export type TripSummary = {
  id: string;
  title: string;
  destinationName: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  status: TripStatus;
  coverImageUrl: string | null;
  deletedAt: string | null;
};

export type TripDetail = TripSummary & {
  ownerId: string;
  description: string | null;
  baseCurrency: string;
  updatedAt: string;
  /** 현재 사용자의 역할. 편집 가능 여부 판단에 쓴다. */
  role: TripRole;
};

export type ItineraryItem = {
  id: string;
  tripId: string;
  type: ItemType;
  status: ItemStatus;
  title: string;
  note: string | null;
  locationText: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  sortOrder: number;
  updatedAt: string;
};

/** owner/editor 만 편집할 수 있다. RLS 와 같은 규칙을 화면에서도 쓴다. */
export function canEdit(role: TripRole): boolean {
  return role === "owner" || role === "editor";
}
