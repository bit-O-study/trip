import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { MapPoint } from "@/features/map/trip-map";
import { PlaceSearch } from "@/features/places/components/place-search";
import { softDeleteTripAction } from "@/features/trips/actions";
import { ItemForm } from "@/features/trips/components/item-form";
import { ItemRow, type DayOption } from "@/features/trips/components/item-row";
import { TripBoard } from "@/features/trips/components/trip-board";
import { listItems, getTrip, listRestaurantCandidates } from "@/features/trips/queries";
import { canEdit, type ItineraryItem } from "@/features/trips/types";
import { InviteLink } from "@/features/voting/invite-link";
import { RestaurantPoll } from "@/features/voting/restaurant-poll";
import { dayColorVar } from "@/lib/day-color";
import { tripDays, tripDurationLabel, zonedDateKey } from "@/lib/datetime";

type Props = {
  params: Promise<{ tripId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  return { title: trip?.title ?? "여행" };
}

export default async function TripDetailPage({ params }: Props) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const [items, restaurantCandidates] = await Promise.all([
    listItems(tripId),
    listRestaurantCandidates(tripId),
  ]);
  const days = tripDays(trip.startDate, trip.endDate);
  const editable = canEdit(trip.role);

  // 여행 시간대 기준으로 묶는다. DB 의 trip_private.item_day() 와 같은 규칙이라
  // 화면의 Day 구분과 저장된 순서가 어긋나지 않는다.
  const byDay = new Map<string, ItineraryItem[]>();
  for (const item of items) {
    const key = zonedDateKey(item.startAt, trip.timezone);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(item);
    else byDay.set(key, [item]);
  }

  // 기간 밖으로 벗어난 항목. 기간을 줄이면 생길 수 있고, 숨기면 사용자가
  // "사라졌다"고 느낀다.
  const dayKeys = new Set(days.map((day) => day.date));
  const orphans = [...byDay.entries()]
    .filter(([key]) => !dayKeys.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  // 지도에 찍을 점. 좌표가 없는 항목(수동 입력 등)은 자연스럽게 빠진다.
  const dayIndexByDate = new Map(days.map((day) => [day.date, day.index]));
  const mapPoints: MapPoint[] = [];
  for (const [dateKey, dayItems] of byDay) {
    const dayIndex = dayIndexByDate.get(dateKey);
    if (dayIndex === undefined) continue; // 기간 밖 항목은 지도에서 뺀다
    dayItems.forEach((item, index) => {
      if (!item.coordinate) return;
      mapPoints.push({
        id: item.id,
        title: item.title,
        latitude: item.coordinate.latitude,
        longitude: item.coordinate.longitude,
        dayIndex,
        order: index + 1,
      });
    });
  }
  for (const [index, candidate] of restaurantCandidates.entries()) {
    if (!candidate.coordinate) continue;
    const rating = candidate.googleRating !== null ? ` · ★ ${candidate.googleRating.toFixed(1)}` : "";
    mapPoints.push({
      id: candidate.id,
      title: candidate.title,
      latitude: candidate.coordinate.latitude,
      longitude: candidate.coordinate.longitude,
      dayIndex: 0,
      order: index + 1,
      badgeLabel: `${candidate.cuisineType}${rating} · ${candidate.voteCount}표`,
      warning: candidate.closedOnDate === true ? "쉬는 날입니다" : undefined,
    });
  }

  const dayOptions: DayOption[] = days.map((day) => ({
    date: day.date,
    label: `Day ${day.index + 1} · ${day.shortLabel}(${day.weekday})`,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{trip.title}</h1>
        <p className="text-sm text-muted-foreground">
          {trip.destinationName ? `${trip.destinationName} · ` : ""}
          {trip.startDate} ~ {trip.endDate}
          {(() => {
            const label = tripDurationLabel(trip.startDate, trip.endDate);
            return label ? ` · ${label}` : "";
          })()}
          {" · "}
          {trip.timezone}
        </p>
        {!editable ? (
          <p className="text-sm text-muted-foreground">읽기 전용으로 참여 중입니다.</p>
        ) : null}
      </header>

      {/*
        지도와 타임라인이 선택 상태를 공유한다. 타임라인은 서버 컴포넌트로 남기고
        children 으로 넘긴다 — 클라이언트 경계는 지도와 선택 상태에만 둔다.
      */}
      <TripBoard points={mapPoints} mapClassName="h-64 md:h-80">
        <div className="space-y-6">
          {editable ? (
            <PlaceSearch
              tripId={trip.id}
              defaultDate={days[0]?.date ?? trip.startDate}
              timezone={trip.timezone}
            />
          ) : null}

          <RestaurantPoll
            tripId={trip.id}
            candidates={restaurantCandidates}
            editable={editable}
          />

          {days.length > 1 ? (
            <nav
              aria-label="날짜 이동"
              className="sticky top-14 z-20 -mx-4 bg-background/90 px-4 py-2 backdrop-blur"
            >
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {days.map((day) => (
                  <li key={day.date}>
                    <a
                      href={`#day-${day.date}`}
                      className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: dayColorVar(day.index) }}
                      />
                      Day {day.index + 1}
                      <span className="text-muted-foreground">
                        {day.shortLabel}({day.weekday})
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}

          <div className="space-y-8">
            {days.map((day) => {
              const dayItems = byDay.get(day.date) ?? [];
              return (
                <section key={day.date} id={`day-${day.date}`} className="scroll-mt-32 space-y-3">
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
                        <ItemRow
                          key={item.id}
                          item={item}
                          order={index + 1}
                          dayIndex={day.index}
                          timezone={trip.timezone}
                          tripId={trip.id}
                          editable={editable}
                          canMoveUp={index > 0}
                          canMoveDown={index < dayItems.length - 1}
                          dayOptions={dayOptions}
                          currentDate={day.date}
                        />
                      ))}
                    </ol>
                  )}

                  {editable ? (
                    <ItemForm tripId={trip.id} defaultDate={day.date} timezone={trip.timezone} />
                  ) : null}
                </section>
              );
            })}
          </div>

          {orphans.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold">여행 기간 밖</h2>
              <p className="text-sm text-muted-foreground">
                여행 기간을 벗어난 일정입니다. 아래 날짜 이동으로 여행 기간 안에 넣거나, 여행
                기간을 넓히세요.
              </p>
              {orphans.map(([date, dayItems]) => (
                <div key={date} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{date}</p>
                  <ol className="space-y-2">
                    {dayItems.map((item, index) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        order={index + 1}
                        dayIndex={null}
                        timezone={trip.timezone}
                        tripId={trip.id}
                        editable={editable}
                        canMoveUp={index > 0}
                        canMoveDown={index < dayItems.length - 1}
                        dayOptions={dayOptions}
                        currentDate={date}
                      />
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </TripBoard>

      {trip.role === "owner" ? (
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">여행 관리</summary>
          <div className="mt-3 space-y-3">
            <InviteLink tripId={trip.id} />
            <p className="text-sm text-muted-foreground">
              삭제해도 30일 동안 휴지통에 남아 복구할 수 있습니다.
            </p>
            <form action={softDeleteTripAction}>
              <input type="hidden" name="tripId" value={trip.id} />
              <button
                type="submit"
                className="rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-primary-foreground"
              >
                여행 삭제
              </button>
            </form>
          </div>
        </details>
      ) : null}
    </div>
  );
}
