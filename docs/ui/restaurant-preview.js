const $ = id => document.getElementById(id);
// Fictional restaurants and sample coordinates for UI evaluation only.
const places = [
  {id:1,name:'항구 해산물 식당',original:'港口海鮮餐廳',city:'가오슝',menu:'해산물 · 볶음밥',note:'치진섬 산책 후 점심 후보. 페리 시간 확인.',lat:22.6109,lng:120.2685},
  {id:2,name:'골목 우육면',original:'巷弄牛肉麵',city:'가오슝',menu:'우육면 · 만두',note:'보얼예술특구 관람 후 저녁.',lat:22.6206,lng:120.2818,day:1,meal:'저녁',time:'18:30'},
  {id:3,name:'야시장 파파야 우유',original:'夜市木瓜牛奶',city:'가오슝',menu:'음료 · 간식',note:'야시장 방문할 때 들르기.',lat:22.6322,lng:120.2991},
  {id:4,name:'타이난 아침 식당',original:'台南早餐店',city:'타이난',menu:'소고기탕 · 현지식',note:'타이난 도착 후 첫 끼 후보.',lat:22.9944,lng:120.2026},
  {id:5,name:'골목 망고빙수',original:'巷弄芒果冰',city:'타이난',menu:'빙수 · 디저트',note:'계절 메뉴 확인.',lat:22.9897,lng:120.2092},
  {id:6,name:'타이베이 딤섬집',original:'台北點心店',city:'타이베이',menu:'샤오롱바오 · 딤섬',note:'마지막 날 점심 후보.',lat:25.0331,lng:121.5297},
];
let region='전체',filter='전체',day=0,editing=null,meal='점심',selected=null,schedule=false,timer;
const defaults={'아침':'08:00','점심':'12:00','저녁':'18:00','간식':'15:00'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cityNames={'가오슝':'高雄','타이난':'台南','타이베이':'台北'};
const cityLabel=c=>cityNames[c]?`${c}(${cityNames[c]})`:c;
const nameLabel=p=>p.original?`${p.name}(${p.original})`:p.name;
const nameMarkup=p=>`${esc(p.name)}${p.original?`<span class="original-name">(${esc(p.original)})</span>`:""}`;
let map, layer;
if(window.L){
  map=L.map('map').setView([22.625,120.29],13);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  tiles.on('tileerror',()=>{$('mapNote').textContent='지도 배경을 불러오지 못했습니다. 목록과 일정 추가는 사용할 수 있습니다.';});
  tiles.on('tileload',()=>{$('mapNote').textContent='예시 위치입니다. 실제 식당 위치가 아닙니다.';});
  layer=L.layerGroup().addTo(map);
}else $('mapNote').textContent='지도를 불러오지 못했습니다. 목록에서 맛집을 관리할 수 있습니다.';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3000);}
function visiblePlaces(){
  if(schedule)return places.filter(p=>p.day&&(!day||p.day===day)).sort((a,b)=>a.day-b.day||a.time.localeCompare(b.time));
  const q=$('search').value.toLocaleLowerCase();
  return places.filter(p=>(region==='전체'||p.city===region)&&(filter==='전체'||(filter==='가고 싶은 곳'?!p.day:!!p.day))&&[p.name,p.original,cityLabel(p.city),p.menu,p.note].join(' ').toLocaleLowerCase().includes(q));
}
function selection(){
  const p=visiblePlaces().find(p=>p.id===selected);
  $('mapSelected').innerHTML=p?`<h3>${nameMarkup(p)}</h3><p>${cityLabel(p.city)} · ${esc(p.menu)}</p><p>${p.day?`Day ${p.day} · ${p.meal} · ${p.time}`:'아직 일정에 추가하지 않음'}</p><button data-plan="${p.id}">${p.day?'식사 일정 변경':'식사 일정에 추가'}</button>`:'<p>목록이나 지도에서 맛집을 선택하세요.</p>';
}
function drawMap(fit=true){
  const points=visiblePlaces().filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng));
  $('mapCount').textContent=`${points.length}곳 표시`;
  if(!map)return;
  layer.clearLayers();
  points.forEach(p=>{
    const marker=L.marker([p.lat,p.lng],{title:nameLabel(p),icon:L.divIcon({className:'pin'+(selected===p.id?' active':''),html:String(places.indexOf(p)+1),iconSize:[29,29],iconAnchor:[14,14]})}).addTo(layer);
    marker.on('click',()=>selectPlace(p.id,false));
  });
  if(fit&&points.length)map.fitBounds(points.map(p=>[p.lat,p.lng]),{padding:[35,35],maxZoom:15});
}
function selectPlace(id,pan=true){
  selected=id;selection();drawMap(false);
  document.querySelectorAll('.card').forEach(el=>el.classList.toggle('selected',Number(el.dataset.id)===id));
  const p=places.find(p=>p.id===id);
  if(p&&pan&&map&&Number.isFinite(p.lat)){map.setView([p.lat,p.lng],15);if(innerWidth<761){setMobileView(true);map.invalidateSize();map.setView([p.lat,p.lng],15);}}
  if(!pan)document.querySelector(`[data-id="${id}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function render(){
  $('total').textContent=places.length;
  $('collectionSummary').textContent=`${places.length}곳 저장 · ${places.filter(p=>p.day).length}곳 예정`;
  $('listTitle').textContent=region==='전체'?'저장한 맛집':cityLabel(region);
  $('listSubtitle').textContent=region==='전체'?'여행에서 가보고 싶은 곳':'이 지역에 저장한 맛집';
  $('mapTitle').textContent=schedule?(day?`Day ${day} 맛집 위치`:'전체 식사 일정'):region==='전체'?'전체 맛집 위치':`${cityLabel(region)} 맛집 위치`; 
  $('regions').innerHTML=['전체','가오슝','타이난','타이베이'].map(c=>`<button aria-pressed="${region===c}" data-city="${c}"><span class="region-name">${cityLabel(c)}</span><span class="tiny">${places.filter(p=>c==='전체'||p.city===c).length}</span></button>`).join('');
  const visible=visiblePlaces();
  if(!visible.some(p=>p.id===selected))selected=null;
  $('filters').innerHTML=['전체','가고 싶은 곳','일정에 추가됨'].map(f=>`<button aria-pressed="${filter===f}" data-filter="${f}">${f}</button>`).join('')+`<span class="count">${visible.length}곳</span>`;
  $('cards').innerHTML=visible.map(p=>`<article class="card${selected===p.id?' selected':''}" data-id="${p.id}"><div class="cardhead"><span class="place-number">${String(places.indexOf(p)+1).padStart(2,"0")}</span><h3>${nameMarkup(p)}</h3>${p.day?`<span class="scheduled">Day ${p.day} · ${p.meal} · ${p.time}</span>`:'<span class="muted tiny">가고 싶은 곳</span>'}</div><p class="meta">${cityLabel(p.city)} · ${esc(p.menu||'메뉴 미입력')}</p>${p.note?`<p class="note">${esc(p.note)}</p>`:''}<div class="actions"><button data-plan="${p.id}">${p.day?'식사 일정 변경':'일정에 추가'}</button>${Number.isFinite(p.lat)?`<button data-map="${p.id}">지도에서 보기</button>`:'<span class="muted tiny">위치 미등록</span>'}<details class="more-actions"><summary aria-label="${esc(nameLabel(p))} 더보기">더보기</summary><div>${p.day?`<button data-unplan="${p.id}">일정에서 빼기</button>`:""}<button data-remove="${p.id}">보관함에서 삭제</button></div></details></div></article>`).join('')||'<p class="empty">조건에 맞는 맛집이 없습니다.</p>';
  $('days').innerHTML=[0,1,2,3,4,5].map(d=>`<button data-day="${d}" aria-pressed="${day===d}">${d?'Day '+d:'모두'}</button>`).join('');
  const planned=places.filter(p=>p.day&&(!day||p.day===day)).sort((a,b)=>a.day-b.day||a.time.localeCompare(b.time));
  $('timeline').innerHTML=planned.map(p=>`<article class="timeline" data-id="${p.id}"><span class="muted tiny">Day ${p.day} · 11월 ${18+p.day}일</span><p class="meal-label">${p.meal} <span class="muted">${p.time}</span></p><h3>${nameMarkup(p)}</h3><p class="muted tiny">${cityLabel(p.city)} · ${esc(p.menu)}</p><div class="actions"><button data-plan="${p.id}">식사 일정 변경</button>${Number.isFinite(p.lat)?`<button data-map="${p.id}">지도에서 보기</button>`:''}</div></article>`).join('')||'<p class="empty">이 날짜에 추가한 맛집이 없습니다.</p>';
  drawMap();selection();
}
function renderMeals(){$('meals').innerHTML=Object.keys(defaults).map(m=>`<button type="button" data-meal="${m}" aria-pressed="${meal===m}">${m}</button>`).join('');}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(d.city){region=d.city;render();}if(d.filter){filter=d.filter;render();}if(d.day!==undefined){day=Number(d.day);render();}
  if(d.close)$(d.close).close();
  if(d.plan){editing=places.find(p=>p.id===Number(d.plan));$('planName').textContent=nameLabel(editing);$('planDay').value=editing.day||1;meal=editing.meal||'점심';$('planTime').value=editing.time||defaults[meal];renderMeals();$('planDialog').showModal();}
  if(d.meal){meal=d.meal;$('planTime').value=defaults[meal];renderMeals();}
  if(d.map)selectPlace(Number(d.map));
  if(d.unplan){const p=places.find(p=>p.id===Number(d.unplan));delete p.day;delete p.time;delete p.meal;render();toast('일정에서 뺐습니다. 보관함에는 남아 있습니다.');}
  if(d.remove){places.splice(places.findIndex(p=>p.id===Number(d.remove)),1);render();toast('미리보기에서 삭제했습니다.');}
});
$('search').addEventListener('input',()=>render());
$('new').onclick=()=>{$('addForm').reset();$('city').value=region==='전체'?'가오슝':region;$('addDialog').showModal();};
$('addForm').onsubmit=e=>{
  e.preventDefault();const name=$('name').value.trim();if(!name){$('name').focus();return;}
  const lat=$('latitude').value,lng=$('longitude').value;
  if(Boolean(lat)!==Boolean(lng)){toast('위도와 경도를 함께 입력하세요.');return;}
  places.push({id:Date.now(),name,original:$('original').value.trim(),city:$('city').value,menu:$('menu').value.trim(),note:$('memo').value.trim(),...(lat&&lng?{lat:Number(lat),lng:Number(lng)}:{})});
  region=$('city').value;filter='전체';$('search').value='';$('addDialog').close();render();toast('보관함에 저장했습니다.');
};
$('planDay').innerHTML=[1,2,3,4,5].map(d=>`<option value="${d}">Day ${d} · 11월 ${18+d}일</option>`).join('');
$('planForm').onsubmit=e=>{e.preventDefault();editing.day=Number($('planDay').value);editing.meal=meal;editing.time=$('planTime').value;$('planDialog').close();render();toast(`Day ${editing.day} ${editing.meal} 일정에 추가했습니다.`);};
function tab(value){schedule=value;document.body.classList.toggle("schedule-view",value);$('library').hidden=value;$('schedule').hidden=!value;$('scheduleTab').setAttribute('aria-pressed',value);$('savedTab').setAttribute('aria-pressed',!value);render();}
$('scheduleTab').onclick=()=>tab(true);$('savedTab').onclick=()=>tab(false);render();

function setMobileView(showMap){document.body.classList.toggle("show-map",showMap);$("listView").setAttribute("aria-pressed",!showMap);$("mapView").setAttribute("aria-pressed",showMap);if(map){map.invalidateSize();drawMap();}}
$("listView").onclick=()=>setMobileView(false);$("mapView").onclick=()=>setMobileView(true);
