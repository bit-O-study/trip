import { listTravelLegs } from "@/features/trips/queries";
import { Suspense } from "react";
import { neighborMap, legKey } from "@/features/trips/travel";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { MapPoint } from "@/features/map/trip-map";
import { listShareLinks } from "@/features/share/queries";
import { isShareReadable } from "@/features/share/server";
import { ShareLinkManager } from "@/features/share/share-link-manager";
import { softDeleteTripAction, updateTripAction } from "@/features/trips/actions";
import { BulkDeleteProvider, BulkDeleteToolbar } from "@/features/trips/components/bulk-delete";
import { DayItemAdd } from "@/features/trips/components/day-item-add";
import { ItemRow } from "@/features/trips/components/item-row";
import { TripBoard } from "@/features/trips/components/trip-board";
import { ItineraryFinder } from "@/features/trips/components/itinerary-finder";
import { indexContinuingStays } from "@/features/trips/overview";
import { TripForm } from "@/features/trips/components/trip-form";
import { TripMembers } from "@/features/trips/components/trip-members";
import { getTrip, listTripSchedule, listTripMembers } from "@/features/trips/queries";
import { canEdit, type ItineraryItem, type TripMember } from "@/features/trips/types";
import type { CurrentUser } from "@/lib/supabase/user";
import { InviteLink } from "@/features/voting/invite-link";
import { RestaurantPoll } from "@/features/voting/restaurant-poll";
import { dayColorVar, lineLetter } from "@/lib/day-color";
import { getCurrentUser } from "@/lib/supabase/user";
import { tripDays, tripDurationLabel, zonedDateKey } from "@/lib/datetime";

type Props = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ShareSettings({ tripId }: { tripId: string }) {
  const links = await listShareLinks(tripId).catch(() => null);
  return links ? <ShareLinkManager tripId={tripId} links={links} readable={isShareReadable()} />
    : <p role="status" className="text-sm text-muted-foreground">공유 설정을 불러오지 못했습니다. 새로고침해 다시 시도해 주세요. 일정은 계속 이용할 수 있습니다.</p>;
}

async function TripPeople({ members, viewer, tripId, manageable }: { members: Promise<TripMember[] | null>; viewer: Promise<CurrentUser | null>; tripId: string; manageable: boolean }) {
  const [people, user] = await Promise.all([members, viewer]);
  return people ? <TripMembers members={people} manageable={manageable} tripId={tripId} currentUserId={user?.id ?? null} />
    : <p role="status" className="text-sm text-muted-foreground">참여자 정보를 불러오지 못했습니다. 새로고침해 주세요.</p>;
}

async function MemberCount({ members }: { members: Promise<TripMember[] | null> }) {
  const people = await members;
  return <>{people?.length ?? "—"}</>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  return { title: trip?.title ?? "여행" };
}

export default async function TripDetailPage({ params, searchParams }: Props) {
  const { tripId } = await params;
  await searchParams;
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  const members = listTripMembers(tripId).catch(() => null);
  const viewer = getCurrentUser();
  const [schedule, travelLegs] = await Promise.all([
    listTripSchedule(tripId),
    listTravelLegs(tripId).catch(() => null),
  ]);
  const { items, polls: restaurantPolls } = schedule;
  const legs = new Map((travelLegs ?? []).map((leg) => [legKey(leg.fromId, leg.toId), leg]));
  const neighbors = neighborMap(items);
  const days = tripDays(trip.startDate, trip.endDate);
  const staysByDate = indexContinuingStays(items, days.map((day) => day.date), trip.timezone);
  const editable = canEdit(trip.role);

  /*
   * 새 투표의 기본 날짜.
   *
   * 무조건 첫날을 쓰면 이미 시작한 여행에서 지난 날짜가 기본값이 된다.
   * 투표 종료 시각이 과거면 만들자마자 확정돼 "후보 없음" 으로 끝나므로,
   * 아직 오지 않은 첫 날을 고른다.
   */
  const todayKey = zonedDateKey(new Date(), trip.timezone);
  const pollDefaultDate =
    days.find((day) => day.date >= todayKey)?.date ?? days.at(-1)?.date ?? trip.startDate;

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
  for (const [pollIndex, poll] of restaurantPolls.entries()) {
    if (poll.status !== "open") continue;
    for (const [index, candidate] of poll.candidates.entries()) {
      if (!candidate.coordinate) continue;
      const rating = candidate.googleRating !== null ? ` · ★ ${candidate.googleRating.toFixed(1)}` : "";
      mapPoints.push({
        id: candidate.id,
        title: candidate.title,
        latitude: candidate.coordinate.latitude,
        longitude: candidate.coordinate.longitude,
        dayIndex: days.length + pollIndex,
        order: index + 1,
        kind: "candidate",
        badgeLabel: `${poll.title} · ${candidate.cuisineType}${rating} · ${candidate.voteCount}표`,
        warning: candidate.closedOnDate === true ? "쉬는 날입니다" : undefined,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="ticket">
      <header className="flex flex-wrap items-start justify-between gap-4 p-5 pb-5">
        <div className="min-w-0 space-y-1.5">
        <h1 className="truncate text-3xl font-bold tracking-tight">{trip.title}</h1>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
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
        </div>
        <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">참여자를 불러오는 중…</p>}><TripPeople
          members={members}
          manageable={trip.role === "owner"}
          tripId={trip.id}
          viewer={viewer}
        /></Suspense>
      </header>

      <div className="ticket-perf" aria-hidden />
      <section aria-label="여행 요약" className="grid grid-cols-3 divide-x divide-border text-left">
        <div className="px-5 py-4"><p className="font-mono text-2xl font-semibold tracking-tight">{items.length}</p><p className="text-xs text-muted-foreground">등록한 일정</p></div>
        <div className="px-4 py-4"><p className="font-mono text-2xl font-semibold tracking-tight">{days.filter((day) => (byDay.get(day.date)?.length ?? 0) > 0).length}<span className="text-base text-muted-foreground"> / {days.length}</span></p><p className="text-xs text-muted-foreground">일정이 있는 날</p></div>
        <div className="px-4 py-4"><p className="font-mono text-2xl font-semibold tracking-tight"><Suspense fallback="…"><MemberCount members={members} /></Suspense></p><p className="text-xs text-muted-foreground">함께하는 멤버</p></div>
      </section>
      </div>

      {/*
        지도와 타임라인이 선택 상태를 공유한다. 타임라인은 서버 컴포넌트로 남기고
        children 으로 넘긴다 — 클라이언트 경계는 지도와 선택 상태에만 둔다.
      */}
      <TripBoard
        points={mapPoints}
        mapClassName="h-64 md:h-80"
        /*
         * 첫 점을 초기 중심으로 준다. 점이 여럿이면 지도가 곧바로 bounds 로
         * 다시 잡으므로 실제로는 "아직 점이 하나뿐일 때" 를 위한 값이다.
         * (목적지 이름을 문자열로 비교해 좌표를 박아 넣던 자리다 — 제주만
         *  맞고 나머지 목적지는 전부 틀렸다.)
         */
        initialCenter={mapPoints[0] ? { latitude: mapPoints[0].latitude, longitude: mapPoints[0].longitude } : undefined}
        timezone={trip.timezone}
      >
        <BulkDeleteProvider tripId={trip.id} itemIds={editable ? items.map((item) => item.id) : []}>
        <div className="space-y-6">
          <ItineraryFinder items={items} timezone={trip.timezone} />
          {schedule.pollError ? <p role="status" className="rounded-xl border border-border bg-card p-3 text-sm">투표 정보를 불러오지 못했습니다. 새로고침해 다시 확인해 주세요. 일정은 계속 이용할 수 있습니다.</p> : null}
          {travelLegs === null ? <p role="status" className="rounded-xl border border-border bg-card p-3 text-sm">저장된 이동 정보를 불러오지 못했습니다. 새로고침 후 이동 정보를 수정해 주세요.</p> : null}
          <RestaurantPoll
            tripId={trip.id}
            polls={restaurantPolls}
            editable={editable}
            defaultDate={pollDefaultDate}
            timezone={trip.timezone}
          />

          <BulkDeleteToolbar />
          {editable ? <p className="text-xs text-muted-foreground">일정을 끌어 순서를 바꿀 수 있습니다. 휴대폰에서는 길게 누른 뒤 이동하세요. 키보드는 일정에 포커스한 뒤 Alt + 위·아래 방향키를 사용하세요.</p> : null}

          {days.length > 1 ? (
            <nav
              aria-label="날짜 이동"
              className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-md"
            >
              <ul className="flex gap-2 overflow-x-auto pb-1">
                <li><a href="#all-events" className="flex shrink-0 items-center whitespace-nowrap rounded-full border border-foreground bg-foreground px-3.5 py-1.5 text-sm font-medium text-background">모두</a></li>
                {dayKeys.has(todayKey) ? <li><a href={`#day-${todayKey}`} className="flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-foreground px-3.5 py-1.5 text-sm font-medium">오늘</a></li> : null}
                {days.map((day) => (
                  <li key={day.date}>
                    <a
                      href={`#day-${day.date}`}
                      className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3.5 py-1.5 text-sm transition-colors hover:bg-muted"
                    >
                      <span
                        aria-hidden
                        className="size-3.5 rounded-full border-[3.5px] bg-card"
                        style={{ borderColor: dayColorVar(day.index) }}
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

          <div id="all-events" className="scroll-mt-32 space-y-8">
            {days.map((day) => {
              const dayItems = byDay.get(day.date) ?? [];
              const stays = staysByDate.get(day.date) ?? [];
              return (
                <section data-drop-day={editable ? day.date : undefined} data-trip-id={trip.id} key={day.date} id={`day-${day.date}`} className="scroll-mt-32 space-y-3">
                  <h2 className="flex items-center gap-2.5 text-lg font-bold">
                    <span
                      aria-hidden
                      className="line-code h-6 rounded-md px-2 text-[11px] font-semibold"
                      style={{ "--line": dayColorVar(day.index) } as React.CSSProperties}
                    >{lineLetter(day.index)}</span>
                    Day {day.index + 1}
                    <span className="font-normal text-muted-foreground">
                      {day.shortLabel} ({day.weekday})
                    </span>
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{dayItems.length}개 일정</span>
                  </h2>

                  {stays.map((stay) => <div key={stay.id} className="rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-[var(--shadow-card)]">
                    <span className="font-medium">{stay.title}</span>
                    <span className="ml-2 text-muted-foreground">{zonedDateKey(stay.endAt!, trip.timezone) === day.date ? "체크아웃 예정" : "숙박 중"}</span>
                    {stay.locationText ? <p className="mt-1 text-xs text-muted-foreground">{stay.locationText}</p> : null}
                  </div>)}

                  {dayItems.length === 0 ? (
                    <p className="rounded-xl border-2 border-dashed border-rail bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                      이 날의 일정이 없습니다
                    </p>
                  ) : (
                    <ol className="line-list">
                      {dayItems.map((item, index) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                        previous={neighbors.get(item.id)?.previous}
                        next={neighbors.get(item.id)?.next}
                        previousLeg={legs.get(legKey(neighbors.get(item.id)?.previous?.id ?? "", item.id))}
                        nextLeg={legs.get(legKey(item.id, neighbors.get(item.id)?.next?.id ?? ""))}
                          order={index + 1}
                          dayIndex={day.index}
                          timezone={trip.timezone}
                          tripId={trip.id}
                          editable={editable}
                          travelEditable={editable && travelLegs !== null}
                          days={days}
                          isFirst={index === 0}
                          isLast={index === dayItems.length - 1}
                          dateKey={day.date}
                        />
                      ))}
                    </ol>
                  )}

                  {editable ? (
                    <DayItemAdd
                      tripId={trip.id}
                      date={day.date}
                      timezone={trip.timezone}
                      polls={restaurantPolls}
                    />
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
                  <ol className="line-list">
                    {dayItems.map((item, index) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        previous={neighbors.get(item.id)?.previous}
                        next={neighbors.get(item.id)?.next}
                        previousLeg={legs.get(legKey(neighbors.get(item.id)?.previous?.id ?? "", item.id))}
                        nextLeg={legs.get(legKey(item.id, neighbors.get(item.id)?.next?.id ?? ""))}
                        order={index + 1}
                        dayIndex={null}
                        timezone={trip.timezone}
                        tripId={trip.id}
                        editable={editable}
                        travelEditable={editable && travelLegs !== null}
                        days={days}
                        isFirst={index === 0}
                        isLast={index === dayItems.length - 1}
                        dateKey={date}
                      />
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ) : null}
        </div>
        </BulkDeleteProvider>
      </TripBoard>

      {editable ? (
        <details className="rounded-2xl border border-border bg-card px-5 py-3.5 shadow-[var(--shadow-card)]">
          <summary className="cursor-pointer text-sm font-medium">여행 관리</summary>
          <div className="mt-4 space-y-6">
            <section className="space-y-2">
              <h2 className="text-sm font-medium">데이터 내보내기</h2>
              <p className="text-xs text-muted-foreground">
                일정·참여자·투표를 JSON 파일로 내려받습니다. 서비스를 떠나더라도 기록은
                가져갈 수 있어야 합니다.
              </p>
              <a
                href={`/api/trips/${trip.id}/export`}
                download
                className="inline-block rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                여행 JSON 내려받기
              </a>
            </section>

            <section className="space-y-3 border-t border-border pt-5">
              <h2 className="text-sm font-medium">여행 정보 수정</h2>
              {/*
                제목·기간·시간대를 고칠 수 있는 유일한 경로다. 낙관적 잠금에 쓰는
                expectedUpdatedAt 을 함께 넘겨, 다른 사람이 먼저 저장했으면
                덮어쓰지 않고 충돌로 잡는다.
              */}
              <TripForm
                action={updateTripAction}
                submitLabel="여행 정보 저장"
                defaults={{
                  tripId: trip.id,
                  expectedUpdatedAt: trip.updatedAt,
                  title: trip.title,
                  destinationName: trip.destinationName ?? "",
                  startDate: trip.startDate,
                  endDate: trip.endDate,
                  timezone: trip.timezone,
                  baseCurrency: trip.baseCurrency,
                }}
              />
            </section>

            {trip.role === "owner" ? (
              <section className="space-y-3 border-t border-border pt-5">
                <h2 className="text-sm font-medium">공유와 삭제</h2>
                <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">공유 설정을 불러오는 중…</p>}>
                  <ShareSettings tripId={trip.id} />
                </Suspense>
                <div className="border-t border-border pt-3">
                  <InviteLink tripId={trip.id} tripTitle={trip.title} />
                </div>
                <p className="text-sm text-muted-foreground">
                  삭제해도 30일 동안 휴지통에 남아 복구할 수 있습니다.
                </p>
                <form action={softDeleteTripAction}>
                  <input type="hidden" name="tripId" value={trip.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-danger px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger hover:text-primary-foreground"
                  >
                    여행 삭제
                  </button>
                </form>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  );
}
