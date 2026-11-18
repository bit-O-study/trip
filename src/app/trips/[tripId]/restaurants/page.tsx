import { notFound } from "next/navigation";
import { getTrip } from "@/features/trips/queries";
import { listSavedRestaurants } from "@/features/restaurants/queries";
import { RestaurantLibrary } from "@/features/restaurants/restaurant-library";
import { TripTabs } from "@/features/restaurants/trip-tabs";
import { getCurrentUser } from "@/lib/supabase/user";

export const metadata = { title: "맛집 보관함" };
export default async function RestaurantPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const [trip, restaurants, viewer] = await Promise.all([getTrip(tripId), listSavedRestaurants(tripId), getCurrentUser()]);
  if (!trip) notFound();
  return <div className="space-y-7">
    <header className="pt-3"><p className="mb-2 text-xs text-muted-foreground">{trip.destinationName || "나의 여행"}</p><h1 className="text-3xl font-semibold tracking-tight">{trip.title}</h1><p className="mt-2 text-xs text-muted-foreground">{trip.startDate} — {trip.endDate} · {trip.timezone}</p></header>
    <TripTabs tripId={tripId} active="restaurants" />
    <RestaurantLibrary trip={trip} restaurants={restaurants} preferenceOwner={viewer?.id} />
  </div>;
}
