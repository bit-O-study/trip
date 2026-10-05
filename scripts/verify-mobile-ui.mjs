// 실제 컴포넌트·CSS를 렌더하고 외부 서비스/서버 액션만 대체하는 브라우저 회귀 검사.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createServer } = await import(pathToFileURL(require.resolve("vite", { paths: [require.resolve("vitest/package.json")] })).href);
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixture = path.join(root, ".verify-ui");
await mkdir(fixture, { recursive: true });
await writeFile(path.join(fixture, "index.html"), '<html lang="ko"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/.verify-ui/main.tsx"></script></body></html>');
await writeFile(path.join(fixture, "actions.ts"), `
const log = (kind, form) => { window.__actions__.push({kind, ...Object.fromEntries(form)}); };
export async function saveTravelLeg(_,f) { log('travel',f); return {status:'success',message:'이동 정보를 저장했습니다.'}; }
export async function moveItemAfterAction(f) { log('drop',f); }
export async function moveItemUpAction(f) { log('up',f); }
export async function moveItemDownAction(f) { log('down',f); }
export async function moveItemToDayAction(f) { log('day',f); }
export async function updateItemAction(_,f) { log('edit',f); return {status:'idle'}; }
export async function createItemAction(_,f) { log('create',f); return {status:'idle'}; }
export async function addPlaceToTripAction(_,f) { log('place',f); return {status:'success',message:'추가했습니다.'}; }
export async function deleteItemAction(f) { log('delete',f); }
export async function deleteItemsAction(f) { log('delete-many',f); }
`);
await writeFile(path.join(fixture, "board.ts"), 'export const timelineItemDomId = id => `item-${id}`; export const useItemSelection = () => ({ selectedId: null, select: () => {} });');
await writeFile(path.join(fixture, "main.tsx"), `
import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
import '../src/app/globals.css';
import {ItemRow} from '../src/features/trips/components/item-row';
import {PlaceSearch} from '../src/features/places/components/place-search';
import {tripDays} from '../src/lib/datetime';
window.__actions__=[];
const days=tripDays('2026-10-05','2026-10-06');
const base={tripId:'trip',type:'food',status:'confirmed',note:null,locationText:'서울시 종로구 긴 주소',startAt:'2026-10-05T01:00:00Z',endAt:null,allDay:false,sortOrder:1000,updatedAt:'2026-10-05T01:00:00Z',coordinate:{latitude:37.5,longitude:127}};
function App(){ const [travel,setTravel]=useState(false); const [count,setCount]=useState(2); window.__showTravel__=()=>setTravel(true); window.__showLarge__=()=>{setTravel(true);setCount(200)}; return <main className="mx-auto max-w-3xl space-y-4 p-4"><ol className="space-y-4">{Array.from({length:count},(_,i)=>i===0?'first':i===1?'second':'item-'+i).map((id,index)=><ItemRow key={id} previous={travel && index ? {...base,id:'first',title:'이전 장소'} : undefined} next={travel && index<count-1 ? {...base,id:'second',title:'다음 장소',coordinate:{latitude:37.6,longitude:127.1}} : undefined} item={{...base,id,title:index?'두 번째 장소':'아주 긴 이름을 가진 장소와 모바일 버튼 배치 확인'}} order={index+1} dayIndex={0} timezone="Asia/Seoul" tripId="trip" editable days={days} isFirst={!index} isLast={!!index} dateKey="2026-10-05" />)}</ol><section data-trip-id="trip" data-drop-day="2026-10-06" className="h-24 border p-4">다음 날짜</section><PlaceSearch tripId="trip" defaultDate="2026-10-05" timezone="Asia/Seoul" polls={[]} /></main>; } createRoot(document.getElementById('root')).render(<App />);
`);
const server = await createServer({ root, configFile: false, optimizeDeps: { include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"], force: true }, resolve: { dedupe: ["react", "react-dom"], alias: [
  { find: "@/features/trips/travel-actions", replacement: path.join(fixture, "actions.ts") },
  { find: "@/features/trips/actions", replacement: path.join(fixture, "actions.ts") },
  { find: "@/features/places/actions", replacement: path.join(fixture, "actions.ts") },
  { find: "@/features/trips/components/trip-board", replacement: path.join(fixture, "board.ts") },
  { find: "@", replacement: path.join(root, "src") },
] }, server: { host: "127.0.0.1", port: 3188, strictPort: true } });
let browser;
try {
  await server.listen(); browser = await chromium.launch({ headless: true, channel: "msedge" });
  for (const width of [320, 390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    const place = {provider:'kakao',providerPlaceId:'p',name:'변경한 장소',categoryGroup:'food',category:null,address:'서울',roadAddress:'서울 테스트로',latitude:37.6,longitude:127.1,phone:null,url:null,cuisineType:null,googleRating:null,closedOnDate:null};
    await page.route('**/api/places/search?**', route => route.fulfill({json:{results:[place],totalCount:1,reachableCount:1}}));
    await page.goto('http://127.0.0.1:3188/.verify-ui/index.html');
    await page.locator('[data-drag-item="second"]').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    const first = page.locator('[data-drag-item="first"]'), second = page.locator('[data-drag-item="second"]');
    // 짧은 터치 스와이프는 재정렬 대신 스크롤한다.
    await page.evaluate(() => { document.body.style.minHeight = '2000px'; });
    const swipeBox = await first.boundingBox();
    const swipe = await context.newCDPSession(page);
    await swipe.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipeBox.x+30,y:swipeBox.y+70}]});
    await swipe.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipeBox.x+30,y:swipeBox.y+15}]});
    await swipe.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(await page.evaluate(() => window.scrollY > 0));
    assert.equal(await page.evaluate(() => window.__actions__.length),0);
    await page.evaluate(() => { document.body.style.minHeight = ''; window.scrollTo(0,0); });
    const from = await first.boundingBox(), to = await second.boundingBox();
    await page.mouse.move(from.x+40,from.y+20); await page.mouse.down();
    await page.mouse.move(to.x+40,to.y+to.height-5,{steps:10}); await page.mouse.up();
    await page.waitForFunction(() => window.__actions__.some(a=>a.kind==='drop'));
    assert.equal(await page.evaluate(() => window.__actions__.find(a=>a.kind==='drop').targetId),'second');
    // CDP의 실제 터치 입력으로 날짜 간 이동도 확인한다.
    await first.scrollIntoViewIfNeeded();
    const touchFrom=await first.boundingBox(), day=await page.locator('[data-drop-day]').boundingBox();
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchFrom.x+50,y:touchFrom.y+20}]});
    await page.waitForTimeout(260);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:day.x+50,y:day.y+20}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(() => window.__actions__.some(a=>a.kind==='day'));
    await first.getByRole('button',{name:'수정',exact:true}).click();
    await first.getByRole('button',{name:'장소 검색해서 변경'}).click();
    await first.getByRole('button',{name:'검색',exact:true}).click();
    await first.getByRole('button',{name:'선택',exact:true}).click();
    assert.equal(await first.getByLabel('제목',{exact:true}).inputValue(),'변경한 장소');
    await first.getByRole('button',{name:'수정 저장'}).click();
    await page.waitForFunction(() => window.__actions__.some(a=>a.kind==='edit'));
    assert.equal(await page.evaluate(() => JSON.parse(window.__actions__.find(a=>a.kind==='edit').selectedPlace).latitude),37.6);
    await page.getByLabel('장소 검색어').fill('장소');
    await page.getByRole('button',{name:'검색',exact:true}).click();
    await page.getByRole('button',{name:'선택',exact:true}).click();
    await page.getByLabel('방문 시각').waitFor();
    assert.equal(await page.getByLabel('장소 검색어').count(),0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false,`form overflow ${width}`);
    const placeForm=page.locator('form').filter({has:page.getByLabel('방문 시각')});
    await placeForm.getByLabel('메모',{exact:true}).fill('음식점 예약 메모');
    await placeForm.getByRole('button',{name:'일정에 추가',exact:true}).click();
    await page.waitForFunction(()=>window.__actions__.some(a=>a.kind==='place'));
    assert.equal(await page.evaluate(()=>JSON.parse(window.__actions__.find(a=>a.kind==='place').payload).note),'음식점 예약 메모');
    place.categoryGroup='lodging'; place.name='테스트 숙소';
    await page.getByLabel('장소 검색어').fill('숙소');
    await page.getByRole('button',{name:'검색',exact:true}).click();
    await page.getByRole('button',{name:'선택',exact:true}).click();
    assert.equal(await page.getByLabel('체크인',{exact:true}).inputValue(),'2026-10-05T15:00');
    assert.equal(await page.getByLabel('체크아웃',{exact:true}).inputValue(),'2026-10-06T11:00');
    const hotelForm=page.locator('form').filter({has:page.getByLabel('체크인',{exact:true})});
    await hotelForm.getByLabel('메모',{exact:true}).fill('숙박 예약번호 123');
    await hotelForm.getByRole('button',{name:'일정에 추가',exact:true}).click();
    await page.waitForFunction(()=>window.__actions__.filter(a=>a.kind==='place').length===2);
    const savedHotel=await page.evaluate(()=>JSON.parse(window.__actions__.filter(a=>a.kind==='place')[1].payload));
    assert.equal(savedHotel.endLocal,'2026-10-06T11:00'); assert.equal(savedHotel.note,'숙박 예약번호 123');
    await first.getByRole('button',{name:'수정 닫기',exact:true}).click();
    await page.evaluate(()=>window.__showTravel__());
    const travel=first.getByRole('region',{name:'다음 일정과 이동'});
    await travel.getByText('이동 정보 입력',{exact:true}).click();
    await travel.locator('select[name="mode"]').selectOption('train');
    await travel.getByLabel('이동시간 (분)',{exact:true}).fill('90');
    await travel.getByLabel('실제 이동거리 (km, 선택)',{exact:true}).fill('25.5');
    assert.equal(await first.evaluate(el=>getComputedStyle(el).touchAction),'auto');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false, 'travel form overflow '+width);
    await travel.getByRole('button',{name:'이동 정보 저장',exact:true}).click();
    await page.waitForFunction(()=>window.__actions__.some(a=>a.kind==='travel'));
    const savedTravel=await page.evaluate(()=>window.__actions__.find(a=>a.kind==='travel'));
    assert.equal(savedTravel.mode,'train'); assert.equal(savedTravel.minutes,'90'); assert.equal(savedTravel.distanceKm,'25.5');
    assert.equal(savedTravel.fromId,'first'); assert.equal(savedTravel.toId,'second');
    await page.screenshot({path:path.join(fixture,`mobile-${width}.png`),fullPage:true});
    await travel.getByText('이동 정보 입력',{exact:true}).click();
    if(width===390){
      const started=Date.now(); await page.evaluate(()=>window.__showLarge__());
      await page.waitForFunction(()=>document.querySelectorAll('[data-drag-item]').length===200);
      console.log('200-card browser fixture render: '+(Date.now()-started)+'ms; closed travel forms: '+await page.locator('input[name="minutes"]').count());
      assert.equal(await page.locator('input[name="minutes"]').count(),0);
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: layout, mouse/touch drag, edit place, search → time, lodging, notes, travel modes/duration`);
    await context.close();
  }
} finally { await browser?.close(); await server.close(); }
