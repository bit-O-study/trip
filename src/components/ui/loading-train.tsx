import { LoadingStatus } from "./loading-status";

/** 기존 로딩 화면 호출부와 호환되는 공통 상태 화면. */
export function LoadingTrain({ label = "화면 불러오는 중…", className = "" }: { label?: string; className?: string }) {
  return <div className={`space-y-6 py-12 ${className}`} aria-busy="true">
    <LoadingStatus label={label} />
    <div aria-hidden="true" className="mx-auto w-full max-w-2xl space-y-3">
      {["w-2/3", "w-full", "w-5/6"].map(width => <div key={width} className={`h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none ${width}`} />)}
    </div>
  </div>;
}