import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Kakao 지도 SDK 도메인 등록 확인.
 *
 * 지도가 안 뜨는 원인은 대부분 하나다 — Kakao 개발자 콘솔의 **플랫폼 → Web
 * 사이트 도메인**에 그 주소가 등록돼 있지 않다. 그런데 브라우저에서는 이게
 * `ERR_BLOCKED_BY_ORB` 로만 보인다. Kakao 가 JS 대신 401 JSON 을 돌려주고,
 * 브라우저는 JSON 을 스크립트로 실행하지 못해 막기 때문이다. 화면만 봐서는
 * 키가 틀린 건지, 네트워크가 죽은 건지, 도메인 문제인지 구분할 수 없다.
 *
 * 이 스크립트는 Referer 를 바꿔 가며 SDK 를 직접 호출해 그 구분을 대신한다.
 * 콘솔에서 도메인을 등록한 뒤 반영됐는지 확인할 때 쓴다 — 로그인도, 브라우저도
 * 필요 없다.
 *
 * 사용법
 *   npm run kakao:check                       기본 목록(로컬 + 운영) 확인
 *   npm run kakao:check -- https://foo.dev    특정 origin 만 확인
 */

const here = dirname(fileURLToPath(import.meta.url));

/** 등록돼 있어야 하는 주소. 배포 도메인이 늘면 여기에 추가한다. */
const DEFAULT_ORIGINS = [
  "http://localhost:3100",
  "https://trip-planner-tau-jade.vercel.app",
];

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";

function loadKey() {
  if (process.env.NEXT_PUBLIC_KAKAO_JS_KEY) return process.env.NEXT_PUBLIC_KAKAO_JS_KEY;

  // .env.local 은 커밋되지 않으므로 직접 읽는다.
  const path = resolve(join(here, "..", ".env.local"));
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    throw new Error(`NEXT_PUBLIC_KAKAO_JS_KEY 를 찾을 수 없습니다 (.env.local 없음: ${path})`);
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*NEXT_PUBLIC_KAKAO_JS_KEY\s*=\s*(.*?)\s*$/);
    if (match && match[1]) return match[1];
  }
  throw new Error("NEXT_PUBLIC_KAKAO_JS_KEY 가 .env.local 에 없습니다.");
}

async function check(origin, appKey) {
  const url = `${SDK_URL}?appkey=${encodeURIComponent(appKey)}&autoload=false`;

  let response;
  try {
    response = await fetch(url, { headers: { Referer: `${origin}/` } });
  } catch (caught) {
    return { origin, ok: false, reason: `네트워크 오류: ${caught.message}` };
  }

  if (response.ok) {
    const body = await response.text();
    // 정상이면 SDK 자바스크립트가 온다.
    if (body.includes("kakao.maps")) return { origin, ok: true };
    return { origin, ok: false, reason: `예상과 다른 응답 (${body.slice(0, 80)})` };
  }

  const body = await response.text();
  let detail = body.slice(0, 200);
  try {
    const parsed = JSON.parse(body);
    detail = parsed.message ?? detail;
  } catch {
    // JSON 이 아니면 원문 앞부분을 그대로 보여 준다.
  }
  return { origin, ok: false, reason: `HTTP ${response.status} — ${detail}` };
}

const origins = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const targets = origins.length > 0 ? origins : DEFAULT_ORIGINS;

const appKey = loadKey();
console.log(`Kakao 지도 SDK 도메인 확인 (키 뒷 4자리: ...${appKey.slice(-4)})\n`);

const results = [];
for (const origin of targets) {
  results.push(await check(origin, appKey));
}

for (const result of results) {
  if (result.ok) {
    console.log(`  OK   ${result.origin}`);
  } else {
    console.log(`  FAIL ${result.origin}`);
    console.log(`       ${result.reason}`);
  }
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.log(
    [
      "",
      "등록 방법:",
      "  developers.kakao.com → 내 애플리케이션 → 앱 선택",
      "  → 앱 설정 → 플랫폼 → Web → 사이트 도메인",
      "",
      "  경로나 끝의 슬래시 없이 origin 만 넣는다. 포트도 정확히 일치해야 한다.",
      ...failed.map((r) => `    ${r.origin}`),
      "",
      "  Vercel Preview 배포는 URL 이 매번 바뀌고 Kakao 는 wildcard 를 지원하지",
      "  않으므로 등록할 수 없다. Preview 에서 지도가 안 뜨는 것은 정상이다.",
    ].join("\n"),
  );
  process.exitCode = 1;
} else {
  console.log("\n모두 등록돼 있습니다.");
}
