import { LoadingStatus } from "@/components/ui/loading-status";

export function MapLoading() {
  return <LoadingStatus label="지도 불러오는 중…" className="h-full min-h-64 rounded-xl border border-border bg-muted" />;
}
