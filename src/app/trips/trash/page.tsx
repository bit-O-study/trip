import type { Metadata } from "next";
import Link from "next/link";

import { restoreTripAction } from "@/features/trips/actions";
import { listTrips } from "@/features/trips/queries";

export const metadata: Metadata = {
  title: "휴지통",
};

export default async function TrashPage() {
  const trips = await listTrips({ deleted: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">휴지통</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          삭제한 여행은 30일 동안 보관되며 그 안에는 복구할 수 있습니다.
        </p>
      </div>

      {trips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
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
              <form action={restoreTripAction}>
                <input type="hidden" name="tripId" value={trip.id} />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                >
                  복구
                </button>
              </form>
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
