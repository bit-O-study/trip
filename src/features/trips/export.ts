import { listItems, getTrip, listRestaurantPolls, listTripMembers } from "@/features/trips/queries";

/**
 * 여행 전체 JSON 내보내기.
 *
 * "언제든 내 데이터를 가지고 나갈 수 있다" 는 약속이라, 화면에 보이는 것만이
 * 아니라 그 여행에 대해 이 사용자가 볼 수 있는 것을 담는다. 접근 범위는 RLS 가
 * 정한다 — 여기서 권한을 다시 판정하지 않는다.
 *
 * `schemaVersion` 을 넣는 이유: 내보낸 파일은 우리 손을 떠나 몇 년 뒤에 열린다.
 * 형태가 바뀌었을 때 어느 버전으로 읽어야 하는지 파일 자체가 말해야 한다.
 */
export const EXPORT_SCHEMA_VERSION = 1;

export type TripExport = {
  schemaVersion: number;
  exportedAt: string;
  trip: Record<string, unknown>;
  members: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  restaurantPolls: Array<Record<string, unknown>>;
};

export async function buildTripExport(tripId: string): Promise<TripExport | null> {
  const trip = await getTrip(tripId);
  if (!trip) return null;

  const [items, members, polls] = await Promise.all([
    listItems(tripId),
    listTripMembers(tripId),
    listRestaurantPolls(tripId),
  ]);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    trip: {
      id: trip.id,
      title: trip.title,
      destinationName: trip.destinationName,
      startDate: trip.startDate,
      endDate: trip.endDate,
      timezone: trip.timezone,
      baseCurrency: trip.baseCurrency,
      status: trip.status,
      description: trip.description,
      updatedAt: trip.updatedAt,
    },
    /*
     * 다른 사람의 계정 id 는 내보내지 않는다. 표시 이름과 역할이면 "누구와
     * 갔는지" 를 되짚기에 충분하고, 이 파일은 메신저로 전달되기 쉽다.
     */
    members: members.map((member) => ({
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      title: item.title,
      note: item.note,
      locationText: item.locationText,
      startAt: item.startAt,
      endAt: item.endAt,
      allDay: item.allDay,
      coordinate: item.coordinate,
    })),
    restaurantPolls: polls.map((poll) => ({
      id: poll.id,
      title: poll.title,
      scheduledAt: poll.scheduledAt,
      closesAt: poll.closesAt,
      status: poll.status,
      winnerItemId: poll.winnerItemId,
      candidates: poll.candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        locationText: candidate.locationText,
        cuisineType: candidate.cuisineType,
        voteCount: candidate.voteCount,
        coordinate: candidate.coordinate,
      })),
    })),
  };
}

/** 파일 이름. 여행 제목에서 파일명에 못 쓰는 글자를 걷어낸다. */
export function exportFileName(title: string, exportedAt: string): string {
  const safe = title.replace(/[\\/:*?"<>|]/g, "").trim() || "trip";
  return `${safe}-${exportedAt.slice(0, 10)}.json`;
}
