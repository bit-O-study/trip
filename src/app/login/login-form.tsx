"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

type Props = {
  /** 로그인 후 돌아갈 경로. 서버에서 이미 검증된 값이다. */
  next: string;
};

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google로 계속하기" },
  { id: "kakao", label: "카카오로 계속하기" },
] as const;

/**
 * Supabase 가 영어 원문으로 돌려주는 오류를 사용자가 바로 이해할 문장으로 바꾼다.
 * 원문을 그대로 보이면 무엇을 고쳐야 하는지 알 수 없다.
 */
export function friendlyAuthError(caught: unknown): { message: string; unconfirmed: boolean } {
  const raw = caught instanceof Error ? caught.message : "";
  const text = raw.toLowerCase();
  if (text.includes("invalid login credentials")) return { message: "이메일 또는 비밀번호가 올바르지 않습니다. 가입하지 않았다면 회원가입 탭을 눌러 주세요.", unconfirmed: false };
  if (text.includes("email not confirmed")) return { message: "이메일 확인이 아직 끝나지 않았습니다. 받은 확인 메일의 링크를 눌러 주세요.", unconfirmed: true };
  if (text.includes("already registered") || text.includes("already been registered")) return { message: "이미 가입한 이메일입니다. 로그인 탭에서 로그인하세요.", unconfirmed: false };
  if (text.includes("rate limit") || text.includes("too many")) return { message: "요청이 너무 많습니다. 잠시 뒤에 다시 시도하세요.", unconfirmed: false };
  if (text.includes("password should be") || text.includes("weak password")) return { message: "비밀번호는 8자 이상이어야 하고 너무 단순하면 안 됩니다.", unconfirmed: false };
  if (text.includes("fetch") || text.includes("network")) return { message: "네트워크에 연결하지 못했습니다. 연결을 확인하고 다시 시도하세요.", unconfirmed: false };
  return { message: "로그인하지 못했습니다. 잠시 뒤에 다시 시도하세요.", unconfirmed: false };
}

export function LoginForm({ next }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** 확인 메일을 다시 보낼 수 있는 상태(가입 직후, 또는 확인 전 로그인 시도) */
  const [canResend, setCanResend] = useState(false);

  async function handleResend() {
    setError(null);
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: resendError } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl() } });
      if (resendError) throw resendError;
      setNotice(`${email} 로 확인 메일을 다시 보냈습니다. 스팸함도 확인해 주세요.`);
    } catch (caught) {
      setError(friendlyAuthError(caught).message);
    } finally {
      setPending(false);
    }
  }

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCanResend(false);
    setPending(true);

    try {
      const supabase = getSupabaseBrowserClient();

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;

        router.push(next);
        // Server Component 가 새 세션으로 다시 렌더링되도록 강제한다.
        router.refresh();
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl() },
      });
      if (signUpError) throw signUpError;

      setPassword("");
      setCanResend(true);
      setNotice(`${email} 로 확인 메일을 보냈습니다. 메일의 링크를 눌러 가입을 마치세요. 메일이 안 보이면 스팸함도 확인해 주세요. 이미 가입한 이메일이라면 로그인 탭에서 로그인하세요.`);
    } catch (caught) {
      const friendly = friendlyAuthError(caught);
      setError(friendly.message);
      setCanResend(friendly.unconfirmed);
    } finally {
      setPending(false);
    }
  }

  async function handleOAuth(provider: (typeof OAUTH_PROVIDERS)[number]["id"]) {
    setError(null);
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: callbackUrl() },
      });
      if (oauthError) throw oauthError;
      // 성공하면 공급자 페이지로 이동하므로 여기로 돌아오지 않는다.
    } catch (caught) {
      setError(friendlyAuthError(caught).message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist">
        {(
          [
            ["signin", "로그인"],
            ["signup", "회원가입"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
              setNotice(null);
              setCanResend(false);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3.5 py-3 text-base"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-muted-foreground">
            {notice}
          </p>
        ) : null}
        {canResend && email ? (
          <button type="button" onClick={handleResend} disabled={pending} className="text-sm font-medium underline underline-offset-4 disabled:opacity-50">
            확인 메일 다시 보내기
          </button>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mode === "signin" ? "로그인" : "회원가입"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">또는</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        {OAUTH_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            disabled={pending}
            onClick={() => handleOAuth(provider.id)}
            className="w-full rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {provider.label}
          </button>
        ))}
      </div>
    </div>
  );
}
