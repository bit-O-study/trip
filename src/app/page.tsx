import Link from "next/link";

import { listTrips } from "@/features/trips/queries";
import { MapPinIcon, PlusIcon } from "@/components/icons";
import { tripDurationLabel } from "@/lib/datetime";

export default async function TripListPage() {
  const trips = await listTrips();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">내 여행</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            항공편과 장소를 한 타임라인에 모아 관리합니다.
          </p>
        </div>
        <Link
          href="/trips/new"
          className="hidden shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 md:inline-flex"
        >
          <PlusIcon className="size-4" />
          새 여행
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <MapPinIcon className="size-10 text-muted-foreground" />
          <h2 className="mt-4 text-base font-medium">아직 만든 여행이 없습니다</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            여행을 만들고 항공편 번호를 입력하면 일정의 뼈대가 자동으로 채워집니다.
          </p>
          <Link
            href="/trips/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" />첫 여행 만들기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link
                href={`/trips/${trip.id}`}
                className="block rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted"
              >
                <p className="text-base font-medium">{trip.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {trip.destinationName ? `${trip.destinationName} · ` : ""}
                  {trip.startDate} ~ {trip.endDate}
                  {(() => {
                    const label = tripDurationLabel(trip.startDate, trip.endDate);
                    return label ? ` · ${label}` : "";
                  })()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 text-center">
        <Link href="/trips/trash" className="text-sm text-muted-foreground hover:underline">
          휴지통
        </Link>
      </div>
    </div>
  );
}
