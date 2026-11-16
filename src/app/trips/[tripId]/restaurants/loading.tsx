import { LoadingStatus } from "@/components/ui/loading-status";

export default function Loading() {
  return <div className="space-y-6 py-8" aria-busy="true">
    <LoadingStatus label="맛집 보관함 불러오는 중…" />
    <div aria-hidden="true" className="grid gap-5 md:grid-cols-2">
      {[0, 1].map(key => <div key={key} className="h-72 animate-pulse rounded-xl border border-border bg-muted motion-reduce:animate-none" />)}
    </div>
  </div>;
}
