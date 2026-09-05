import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { loadSharedTrip, verifyShareCookie } from "@/features/share/server";
import { SHARE_COOKIE } from "@/features/share/types";
import { ITEM_TYPE_ICONS, ITEM_TYPE_LABELS, type ItemType } from "@/features/trips/types";
import { dayColorVar } from "@/lib/day-color";
import { tripDays, tripDurationLabel, zonedDateKey, zonedTimeLabel } from "@/lib/datetime";

type Props = { params: Promise<{ shortId: string }> };

/*
 * 공유 뷰는 검색엔진에 색인되면 안 된다. 링크를 아는 사람만 보는 화면이다.
 * 헤더(X-Robots-Tag)는 next.config.ts 가 함께 건다 — 메타 태그만으로는
 * 이미지·JSON 같은 하위 응답을 덮지 못한다.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** 쿠키를 매 요청 검증하므로 캐시하지 않는다. */
export const dynamic = "force-dynamic";

async function readGrant(shortId: string) {
  const cookieStore = await cookies();
  return verifyShareCookie(cookieStore.get(SHARE_COOKIE)?.value, shortId);
}

export default async function SharedTripPage({ params }: Props) {
  const { shortId } = await params;

  /*
   * 쿠키가 없거나 다른 여행의 것이면 없는 페이지로 취급한다.
   * "권한이 없습니다" 로 구분해 주면 short_id 를 하나씩 넣어 보며 어떤 여행이
   * 존재하는지 알아낼 수 있다.
   */
  const grant = await readGrant(shortId);
  if (!grant) notFound();

  const trip = await loadSharedTrip(grant);
  if (!trip) notFound();

  const days = tripDays(trip.startDate, trip.endDate);
  const byDay = new Map<string, typeof trip.items>();
  for (const item of trip.items) {
    const key = zonedDateKey(item.startAt, trip.timezone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  const dayKeys = new Set(days.map((day) => day.date));
  const orphans = [...byDay.entries()]
    .filter(([key]) => !dayKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  const durationLabel = tripDurationLabel(trip.startDate, trip.endDate);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          공유된 일정 · 읽기 전용
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{trip.title}</h1>
        <p className="text-sm text-muted-foreground">
          {trip.destinationName ? `${trip.destinationName} · ` : ""}
          {trip.startDate} ~ {trip.endDate}
          {durationLabel ? ` · ${durationLabel}` : ""} · {trip.timezone}
        </p>
      </header>

      {trip.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          아직 공개된 일정이 없습니다.
        </p>
      ) : (
        <div className="space-y-8">
          {days.map((day) => {
            const dayItems = byDay.get(day.date) ?? [];
            return (
              <section key={day.date} className="space-y-3">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ background: dayColorVar(day.index) }}
                  />
                  Day {day.index + 1}
                  <span className="font-normal text-muted-foreground">
                    {day.shortLabel} ({day.weekday})
                  </span>
                </h2>
                {dayItems.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    이 날의 일정이 없습니다
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {dayItems.map((item, index) => (
                      <SharedRow
                        key={item.id}
                        item={item}
                        order={index + 1}
                        dayIndex={day.index}
                        timezone={trip.timezone}
                      />
                    ))}
                  </ol>
                )}
              </section>
            );
          })}

          {orphans.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">여행 기간 밖</h2>
              {orphans.map(([date, dayItems]) => (
                <div key={date} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{date}</p>
                  <ol className="space-y-2">
                    {dayItems.map((item, index) => (
                      <SharedRow
                        key={item.id}
                        item={item}
                        order={index + 1}
                        dayIndex={null}
                        timezone={trip.timezone}
                      />
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}

      <p className="border-t border-border pt-4 text-xs text-muted-foreground">
        이 페이지는 일정 소유자가 만든 공유 링크로 열렸습니다. 편집하려면 소유자에게
        참여 초대를 요청하세요.
      </p>
    </div>
  );
}

function SharedRow({
  item,
  order,
  dayIndex,
  timezone,
}: {
  item: { type: string; title: string; note: string | null; locationText: string | null; startAt: string; allDay: boolean };
  order: number;
  dayIndex: number | null;
  timezone: string;
}) {
  const type = item.type as ItemType;
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium text-primary-foreground"
        style={
          dayIndex === null
            ? { background: "var(--muted)", color: "var(--muted-foreground)" }
            : { background: dayColorVar(dayIndex) }
        }
      >
        {order}
      </span>
      <div className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {item.allDay ? "종일" : zonedTimeLabel(item.startAt, timezone)}
          </span>
          <span className="truncate font-medium">
            <span aria-hidden>{ITEM_TYPE_ICONS[type] ?? "📍"}</span>{" "}
            <span className="sr-only">{ITEM_TYPE_LABELS[type] ?? "일정"}</span>
            {item.title}
          </span>
        </span>
        {item.locationText ? (
          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
            {item.locationText}
          </span>
        ) : null}
        {item.note ? (
          <span className="mt-1 block whitespace-pre-wrap text-sm text-muted-foreground">
            {item.note}
          </span>
        ) : null}
      </div>
    </li>
  );
}
