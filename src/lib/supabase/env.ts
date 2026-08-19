export type SupabaseEnv = {
  url: string;
  publishableKey: string;
};

/**
 * Supabase 접속 정보를 읽는다. 설정되지 않았으면 null 을 돌려준다.
 *
 * NEXT_PUBLIC_* 은 빌드 시 문자열로 치환되므로 반드시 리터럴로 접근해야 한다.
 * process.env[name] 처럼 동적으로 읽으면 클라이언트 번들에서 undefined 가 된다.
 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null;
}

export function requireSupabaseEnv(): SupabaseEnv {
  const env = readSupabaseEnv();
  if (env) return env;

  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 설정하세요. " +
      "자세한 내용은 supabase/README.md 를 참고하세요.",
  );
}

/**
 * 환경변수가 없을 때 "로그아웃 상태"로 간주하고 앱을 계속 띄울지 여부.
 *
 * 개발 중에는 Supabase 프로젝트 없이도 UI 를 만들 수 있어야 하므로 허용한다.
 * **운영에서는 절대 허용하지 않는다.** 환경변수가 빠졌을 때 조용히 통과시키면
 * 보호된 경로의 인증 검사 자체가 사라진다. 배포 사고가 보안 사고가 된다.
 */
export function allowsUnconfiguredAuth(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== "production";
}

/**
 * Supabase URL 에서 프로젝트 ref 를 뽑는다 (https://abcd.supabase.co → "abcd").
 *
 * 개발 중 어느 프로젝트에 붙어 있는지 화면에 보여주기 위한 것이다.
 * 참고 앱과 Trip 프로젝트를 혼동해 남의 DB 에 로그인하는 사고를 막는다.
 */
export function supabaseProjectRef(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const [ref] = hostname.split(".");
    return ref || null;
  } catch {
    return null;
  }
}
