import Link from "@/components/ui/navigation-link";

export function TripTabs({ tripId, active }: { tripId: string; active: "schedule" | "restaurants" }) {
  return <nav aria-label="여행 메뉴" className="flex gap-7 border-b border-border">
    {([{ key: "schedule", label: "일정", href: `/trips/${tripId}` }, { key: "restaurants", label: "맛집 보관함", href: `/trips/${tripId}/restaurants` }] as const).map(tab =>
      <Link key={tab.key} href={tab.href} aria-current={active === tab.key ? "page" : undefined} className={`py-3 text-sm ${active === tab.key ? "border-b-2 border-foreground font-semibold" : "text-muted-foreground"}`}>{tab.label}</Link>)}
  </nav>;
}
