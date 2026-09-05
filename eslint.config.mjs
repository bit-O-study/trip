import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * service role 클라이언트는 RLS 를 통째로 우회한다.
 *
 * 공개 공유 뷰는 로그인하지 않은 방문자에게 여행을 보여 줘야 해서 RLS 로
 * 표현할 수 없고, 그래서 딱 한 곳에서만 우회한다. 그 한 곳이 여러 곳이 되는
 * 순간 RLS 는 장식이 되므로, 규칙을 문서가 아니라 린터가 지키게 한다
 * (docs/architecture.md §6 "격리").
 */
const SERVICE_ROLE_GUARD = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/features/share/server.ts", "src/lib/supabase/server.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/lib/supabase/server",
            importNames: ["createSupabaseServiceRoleClient"],
            message:
              "service role 은 RLS 를 우회합니다. 공유 전용 모듈(src/features/share/server.ts)에서만 쓰세요.",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  SERVICE_ROLE_GUARD,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test and coverage artifacts.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
