import type { Metadata } from "next";
import Link from "next/link";

import { buildLoginUrl, safeRedirectPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "로그인 실패",
};

const REASONS: Record<string, string> = {
  missing_code: "인증 코드가 전달되지 않았습니다. 링크가 잘렸을 수 있습니다.",
  exchange_failed:
    "인증 링크가 만료되었거나 이미 사용되었습니다. 메일 링크는 로그인을 시작한 브라우저에서 열어야 해요. 다른 기기에서 열었다면 처음 쓰던 기기로 돌아가 다시 시도하세요.",
  not_configured: "서버에 Supabase 설정이 없습니다.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthCodeErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const detail = reason ? REASONS[reason] : undefined;
  // 초대 링크 같은 원래 목적지를 유지한 채 다시 로그인하게 한다.
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 py-12 text-center">
      <h1 className="text-3xl font-bold tracking-tight">로그인하지 못했습니다</h1>
      <p className="text-sm text-muted-foreground">
        {detail ?? "인증 과정에서 문제가 발생했습니다."}
      </p>
      <Link
        href={buildLoginUrl(next)}
        className="inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        다시 로그인
      </Link>
    </div>
  );
}
