import { notFound } from "next/navigation";

import { PlaceSearch } from "@/features/places/components/place-search";
import { getTrip, listRestaurantPolls } from "@/features/trips/queries";
import { canEdit } from "@/features/trips/types";
import { RestaurantPoll } from "@/features/voting/restaurant-poll";
import { zonedDateKey } from "@/lib/datetime";

type Props = {
  params: Promise<{ tripId: string; pollId: string }>;
  searchParams: Promise<{ q?: string }>;
};

export default async function RestaurantPollDetailPage({ params, searchParams }: Props) {
  const { tripId, pollId } = await params;
  const { q } = await searchParams;
  const [trip, polls] = await Promise.all([getTrip(tripId), listRestaurantPolls(tripId)]);
  if (!trip) notFound();
  const poll = polls.find((entry) => entry.id === pollId);
  if (!poll) notFound();

  return (
    <div className="space-y-6">
      <a href={`/trips/${tripId}`} className="inline-block text-sm font-medium text-primary hover:underline">← 여행 일정</a>
      <RestaurantPoll tripId={tripId} polls={[poll]} editable={canEdit(trip.role)} defaultDate={zonedDateKey(poll.scheduledAt, trip.timezone)} timezone={trip.timezone} detail />
      {canEdit(trip.role) && poll.status === "open" ? (
        <PlaceSearch tripId={tripId} defaultDate={zonedDateKey(poll.scheduledAt, trip.timezone)} timezone={trip.timezone} polls={[poll]} initialPollId={poll.id} initialQuery={q ?? ""} />
      ) : null}
    </div>
  );
}
