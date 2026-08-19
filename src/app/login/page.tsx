import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { readSupabaseEnv, supabaseProjectRef } from "@/lib/supabase/env";

export const metadata: Metadata = {
  title: "로그인",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawNext = params.next;
  // 오픈 리다이렉트 방지. 클라이언트로 넘기기 전에 서버에서 검증한다.
  const next = safeRedirectPath(typeof rawNext === "string" ? rawNext : null);

  const env = readSupabaseEnv();
  const projectRef = env ? supabaseProjectRef(env.url) : null;
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="mx-auto w-full max-w-sm space-y-8 py-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
      </div>

      {env ? (
        <LoginForm next={next} />
      ) : (
        <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center">
          <p className="text-sm font-medium">Supabase가 설정되지 않았습니다</p>
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5">.env.local</code>에 Supabase
            접속 정보를 넣으면 로그인이 활성화됩니다. 설정 방법은{" "}
            <code className="rounded bg-muted px-1 py-0.5">supabase/README.md</code>를
            참고하세요.
          </p>
        </div>
      )}

      {isDev && projectRef ? (
        /*
         * 개발 중에만 표시한다. 참고 앱과 Trip 프로젝트를 혼동해 엉뚱한 DB에
         * 사용자를 만드는 사고를 막기 위한 것이다.
         */
        <p className="text-center text-xs text-muted-foreground">
          연결된 Supabase 프로젝트: <code className="font-mono">{projectRef}</code>
        </p>
      ) : null}
    </div>
  );
}
