export function LoadingStatus({ label = "불러오는 중…", className = "" }: { label?: string; className?: string }) {
  return <div role="status" aria-live="polite" className={`flex items-center justify-center gap-3 text-sm text-muted-foreground ${className}`}>
    <span aria-hidden="true" className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />
    <span>{label}</span>
  </div>;
}
