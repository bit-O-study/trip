import { notFound } from "next/navigation";
import { TripTabs } from "@/features/restaurants/trip-tabs";
import { getTrip } from "@/features/trips/queries";
import { canEdit } from "@/features/trips/types";
import { listPackingItems } from "@/features/packing/queries";
import { PackingList } from "@/features/packing/packing-list";

export const metadata = { title: "여행 준비물" };
export default async function PackingPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip || trip.deletedAt) notFound();
  const items = await listPackingItems(tripId);
  return <div className="space-y-7">
    <header className="pt-3"><h1 className="text-3xl font-semibold tracking-tight">{trip.title}</h1><p className="mt-2 text-sm text-muted-foreground">{trip.startDate} — {trip.endDate}</p></header>
    <TripTabs tripId={tripId} active="packing" />
    <PackingList tripId={tripId} items={items} editable={canEdit(trip.role)} />
  </div>;
}
