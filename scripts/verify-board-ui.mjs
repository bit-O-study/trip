// 실제 보드와 입력 폼을 브라우저에서 검증한다. 지도 SDK와 서버 액션만 모형으로 대체한다.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(require.resolve("vite", { paths: [require.resolve("vitest/package.json")] })).href);
const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = path.join(root, ".verify-ui", "board");
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, "index.html"), '<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/.verify-ui/board/main.tsx"></script></body></html>');
await writeFile(path.join(fixture, "actions.ts"), `
export async function createItemAction(){return {status:'idle'}}
export async function addPlaceToTripAction(){return {status:'success'}}
export async function addFlightToTripAction(){return {status:'success'}}
export async function addManualFlightAction(){return {status:'success'}}
`);
await writeFile(path.join(fixture, "map.tsx"), `
import React from 'react';
export function TripMap({className,onSelect}) { return <div className={className} data-testid="map"><button onClick={()=>onSelect('one')}>지도에서 일정 선택</button></div>; }
`);
await writeFile(path.join(fixture, "main.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import '../../src/app/globals.css';
import {TripBoard,useItemSelection} from '../../src/features/trips/components/trip-board';
import {DayItemAdd} from '../../src/features/trips/components/day-item-add';
function Card(){const {selectedId}=useItemSelection();return <div id="item-one"><button data-select-item aria-pressed={selectedId==='one'}>일정 카드</button></div>}
function App(){return <main className="mx-auto max-w-5xl p-4"><TripBoard points={[]} mapClassName="h-64"><section data-testid="timeline" className="space-y-4"><Card/><DayItemAdd tripId="trip" date="2026-11-03" timezone="Asia/Seoul" polls={[]}/><div className="h-[1500px]">긴 일정</div></section></TripBoard></main>}
createRoot(document.getElementById('root')).render(<App/>);
`);
const server = await createServer({ root, configFile: false, optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "next/dynamic"] }, resolve: { dedupe: ["react", "react-dom"], alias: [
  { find: "@/features/map/trip-map", replacement: path.join(fixture, "map.tsx") },
  ...["trips", "places", "flights"].map((feature) => ({ find: `@/features/${feature}/actions`, replacement: path.join(fixture, "actions.ts") })),
  { find: "@", replacement: path.join(root, "src") },
] }, server: { host: "127.0.0.1", port: 3189, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  for (const width of [320, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3189/.verify-ui/board/index.html");
    await page.getByRole("button", { name: "+ 일정 추가", exact: true }).click();
    await page.getByLabel("장소 검색어").fill("작성 중인 장소");
    await page.getByRole("button", { name: "직접 입력", exact: true }).click();
    await page.locator('#item-title').fill("작성 중인 일정");
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "+ 일정 추가", exact: true }).click();
    assert.equal(await page.getByLabel("장소 검색어").inputValue(), "작성 중인 장소");
    await page.getByRole("button", { name: "직접 입력", exact: true }).click();
    assert.equal(await page.locator('#item-title').inputValue(), "작성 중인 일정");
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await page.getByRole("button", { name: "+ 일정 추가", exact: true }).click();
    await page.getByRole("button", { name: "직접 입력", exact: true }).click();
    assert.equal(await page.locator('#item-title').inputValue(), "작성 중인 일정");
    await page.getByRole("button", { name: "지도에서 일정 선택" }).click();
    assert.equal(await page.getByRole("button", { name: "일정 카드" }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("button", { name: "일정 카드" }).evaluate((el) => el === document.activeElement), true);
    const map = await page.getByTestId("map").boundingBox();
    const timeline = await page.getByTestId("timeline").boundingBox();
    if (width >= 1024) {
      assert.ok(map.x >= timeline.x + timeline.width, "desktop split layout");
      await page.evaluate(() => window.scrollTo(0, 600));
      const sticky = await page.getByTestId("map").boundingBox();
      assert.ok(sticky.y >= 0 && sticky.y < 120, "sticky map remains visible");
    } else assert.ok(map.y < timeline.y, "mobile stacked layout");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(fixture, `board-${width}.png`) });
    console.log(`PASS ${width}px: board layout, map focus, draft preservation, no overflow`);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
