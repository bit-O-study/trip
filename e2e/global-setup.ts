import type { FullConfig } from "@playwright/test";

/**
 * dev 서버를 미리 데운다.
 *
 * Turbopack 은 라우트를 처음 요청받을 때 컴파일한다. 모바일·데스크톱 프로젝트가
 * 동시에 차가운 서버를 때리면 첫 테스트들이 컴파일을 기다리며 40초 넘게 걸리고,
 * 타임아웃 경계에서 산발적으로 실패한다.
 *
 * 테스트를 시작하기 전에 주요 경로를 한 번씩 요청해 컴파일을 끝내 둔다.
 * 이 파일이 하는 일은 그것뿐이며, 어떤 상태도 만들지 않는다.
 */

const WARMUP_PATHS = ["/login", "/", "/trips/new", "/auth/auth-code-error"];

async function waitForServer(baseURL: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      await fetch(new URL("/login", baseURL), { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`개발 서버가 ${timeoutMs}ms 안에 응답하지 않았습니다: ${baseURL}`);
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  await waitForServer(baseURL);

  // 순차로 요청한다. 병렬로 보내면 지금 피하려는 상황을 그대로 재현한다.
  for (const path of WARMUP_PATHS) {
    try {
      await fetch(new URL(path, baseURL), { redirect: "manual" });
    } catch {
      // 워밍업 실패는 테스트를 막지 않는다. 느려질 뿐이다.
    }
  }
}
