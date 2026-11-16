"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { LoadingStatus } from "./loading-status";

function NavigationPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return createPortal(<div className="pointer-events-none fixed inset-x-0 top-[calc(3rem+env(safe-area-inset-top))] z-50 flex justify-center p-3">
    <LoadingStatus label="화면 불러오는 중…" className="rounded-lg border border-border bg-card px-4 py-3 shadow-lg" />
  </div>, document.body);
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<NavigationPending /></Link>;
}
