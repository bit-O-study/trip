import { notFound } from "next/navigation";
import { TripTabs } from "@/features/restaurants/trip-tabs";
import { getTrip } from "@/features/trips/queries";
import { canEdit } from "@/features/trips/types";
import { zonedDateKey } from "@/lib/datetime";
import { listExpenses } from "@/features/expenses/queries";
import { ExpenseBook } from "@/features/expenses/expense-book";

export const metadata = { title: "여행 지출" };
export default async function ExpensesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const trip = await getTrip(tripId);
  if (!trip || trip.deletedAt) notFound();
  const expenses = await listExpenses(tripId);
  return <div className="space-y-7">
    <header className="pt-3"><h1 className="text-3xl font-semibold tracking-tight">{trip.title}</h1><p className="mt-2 text-sm text-muted-foreground">{trip.startDate} — {trip.endDate}</p></header>
    <TripTabs tripId={tripId} active="expenses" />
    <ExpenseBook tripId={tripId} expenses={expenses} editable={canEdit(trip.role)} currency={trip.baseCurrency} defaultDate={zonedDateKey(new Date(), trip.timezone)} />
  </div>;
}
