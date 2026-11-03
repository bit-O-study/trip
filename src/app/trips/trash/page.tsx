import type { Metadata } from "next";
import Link from "next/link";

import { TrashRestoreForm } from "@/features/trips/components/trash-restore-form";
import { listTrips } from "@/features/trips/queries";

export const metadata: Metadata = {
  title: "휴지통",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function TrashPage({ searchParams }: Props) {
  const [trips, params] = await Promise.all([listTrips({ deleted: true }), searchParams]);
  // 방금 복구한 여행. 사라진 항목이 어디로 갔는지 알려 주고 바로 열 수 있게 한다.
  const restoredId = typeof params.restored === "string" ? params.restored : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">휴지통</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          삭제한 여행은 여기에 보관되며 복구할 수 있습니다.
        </p>
      </div>

      {restoredId ? (
        <p role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
          <span>여행을 복구했습니다.</span>
          <Link href={`/trips/${restoredId}`} className="font-medium underline underline-offset-4">복구한 여행 열기</Link>
        </p>
      ) : null}

      {trips.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-rail bg-card px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">삭제한 여행이 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-medium">{trip.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {trip.startDate} ~ {trip.endDate}
                </p>
              </div>
              <TrashRestoreForm tripId={trip.id} title={trip.title} />
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 text-center">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          여행 목록으로
        </Link>
      </div>
    </div>
  );
}
