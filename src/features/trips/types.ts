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

export type TripMember = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  role: TripRole;
  joinedAt: string;
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
  /** 지도에 찍을 좌표. 장소가 붙지 않은 항목은 null. */
  coordinate: { latitude: number; longitude: number } | null;
  /** 좌표가 직접 입력한 글자를 자동 검색한 첫 결과다 ("추정 위치"). */
  coordinateEstimated?: boolean;
  /** 항공편이면 공항과 각 공항의 시간대. 시각은 여행 시간대가 아니라 공항 현지 시각으로 보여 준다. */
  flight?: {
    departureAirport: string | null;
    arrivalAirport: string | null;
    departureTimezone: string;
    arrivalTimezone: string;
  } | null;
};

export type RestaurantCandidate = {
  id: string;
  pollId: string;
  title: string;
  locationText: string | null;
  cuisineType: string;
  googleRating: number | null;
  voteCount: number;
  votedByMe: boolean;
  coordinate: { latitude: number; longitude: number } | null;
  /** Google Places 영업시간이 없으면 null, 확인된 휴무면 true. */
  closedOnDate: boolean | null;
};

export type RestaurantPollView = {
  id: string;
  title: string;
  scheduledAt: string;
  closesAt: string;
  status: "open" | "finalized" | "cancelled";
  winnerItemId: string | null;
  createdByMe: boolean;
  candidates: RestaurantCandidate[];
};

/** owner/editor 만 편집할 수 있다. RLS 와 같은 규칙을 화면에서도 쓴다. */
export function canEdit(role: TripRole): boolean {
  return role === "owner" || role === "editor";
}
