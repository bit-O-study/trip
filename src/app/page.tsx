import Link from "next/link";

import { listTrips } from "@/features/trips/queries";
import { MapPinIcon, PlusIcon } from "@/components/icons";
import { TripList } from "@/features/trips/components/trip-list";

export default async function TripListPage() {
  const trips = await listTrips();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">내 여행</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            항공편과 장소를 한 타임라인에 모아 관리합니다.
          </p>
        </div>
        <Link
          href="/trips/new"
          className="hidden shrink-0 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-card)] transition-opacity hover:opacity-90 md:inline-flex"
        >
          <PlusIcon className="size-4" />
          새 여행
        </Link>
      </div>

      {trips.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rail bg-card px-6 py-16 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><MapPinIcon className="size-7" /></span>
          <h2 className="mt-4 text-lg font-semibold">아직 만든 여행이 없습니다</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            여행을 만들고 항공편 번호를 입력하면 일정의 뼈대가 자동으로 채워집니다.
          </p>
          <Link
            href="/trips/new"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" />첫 여행 만들기
          </Link>
        </div>
      ) : (
        <TripList trips={trips} now={new Date().toISOString()} />
      )}

      <div className="pt-2 text-center">
        <Link href="/trips/trash" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          휴지통
        </Link>
      </div>
    </div>
  );
}
