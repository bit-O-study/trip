import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "로그인 실패",
};

const REASONS: Record<string, string> = {
  missing_code: "인증 코드가 전달되지 않았습니다. 링크가 잘렸을 수 있습니다.",
  exchange_failed: "인증 코드가 만료되었거나 이미 사용되었습니다.",
  not_configured: "서버에 Supabase 설정이 없습니다.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuthCodeErrorPage({ searchParams }: Props) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : undefined;
  const detail = reason ? REASONS[reason] : undefined;

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">로그인하지 못했습니다</h1>
      <p className="text-sm text-muted-foreground">
        {detail ?? "인증 과정에서 문제가 발생했습니다."}
      </p>
      <Link
        href="/login"
        className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        다시 로그인
      </Link>
    </div>
  );
}
