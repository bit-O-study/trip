"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { LoadingStatus } from "@/components/ui/loading-status";
import { useRouter } from "next/navigation";
import { TripMap, type MapPoint } from "@/features/map/trip-map";
import dynamic from "next/dynamic";
const PlaceSearch = dynamic(() => import("@/features/places/components/place-search").then(m => m.PlaceSearch), {
  loading: () => <LoadingStatus label="검색 화면 불러오는 중…" className="py-6" />,
});
import type { PlaceSearchResult } from "@/features/places/types";
import { canEdit, type TripDetail } from "@/features/trips/types";
import { tripDays, utcToZonedLocal, zonedDateKey, zonedTimeLabel } from "@/lib/datetime";
import { manageRestaurant } from "./actions";
import { RESERVATION_LABELS, MEALS, MEAL_TIMES, regionName, restaurantName, scheduledItem, type Meal, type SavedRestaurant } from "./model";
import "./restaurant-library.css";

type Props = { trip: TripDetail; restaurants: SavedRestaurant[] };
type Modal = { mode: "save" | "schedule" | "delete" | "unschedule"; restaurant: SavedRestaurant | null };
function subscribeDesktop(listener: () => void) {
  const media = window.matchMedia("(min-width: 761px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
const desktopSnapshot = () => window.matchMedia("(min-width: 761px)").matches;
const serverSnapshot = () => false;
export function RestaurantLibrary({ trip, restaurants }: Props) {
  const router = useRouter();
  const [region, setRegion] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [mapView, setMapView] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [saving, setBusy] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busy = saving || refreshing;
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const editable = canEdit(trip.role) && !trip.deletedAt;
  const days = tripDays(trip.startDate, trip.endDate);
  const regions = [...new Set(restaurants.map(r => regionName(r.region)))].sort((a,b) => a.localeCompare(b,"ko"));
  const activeRegion = regions.includes(region) ? region : "";
  const visible = restaurants.filter(r => {
    const item = scheduledItem(r);
    return (!activeRegion || regionName(r.region) === activeRegion)
      && (status === "all" || (status === "planned" ? !!item : !item))
      && (!date || (!!item && zonedDateKey(item.start_at,trip.timezone) === date))
      && [r.name,r.original_name,r.region,r.menu,r.note].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase());
  });
  const points: MapPoint[] = visible.flatMap(r => r.latitude === null || r.longitude === null ? [] : [{
    id:r.id,title:restaurantName(r),latitude:r.latitude,longitude:r.longitude,
    kind:"candidate" as const,order:restaurants.indexOf(r)+1,
    dayIndex: Math.max(0,days.findIndex(d => d.date === (scheduledItem(r) ? zonedDateKey(scheduledItem(r)!.start_at,trip.timezone) : ""))),
  }]);
  const current = visible.find(r => r.id === selected);
  useEffect(() => {
    if (!modal) { dialog.current?.close(); return; }
    const previous = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [modal]);
  function mealLabel(r: SavedRestaurant) {
    const item=scheduledItem(r);if(!item)return "가고 싶은 곳";
    const key=zonedDateKey(item.start_at,trip.timezone), index=days.findIndex(d=>d.date===key);
    return `${index<0?key:`Day ${index+1}`} · ${r.meal ?? "식사"} · ${zonedTimeLabel(item.start_at,trip.timezone)}`;
  }
  function open(mode: Modal["mode"], restaurant: SavedRestaurant | null = null) { if(busy)return;setError("");setModal({mode,restaurant}); }
  async function submit(action: "save" | "schedule" | "delete" | "unschedule", data: Record<string,unknown>) {
    if(busy)return;setBusy(true);setError("");
    try {
      const r=modal?.restaurant;
      const result=await manageRestaurant({tripId:trip.id,action,id:r?.id??null,expected:r?.updated_at??null,data:{...data,itemUpdatedAt:r?.itinerary_items?.updated_at??null}});
      if(!result.ok){setError(result.message);return;}
      setMessage(result.message);setModal(null);startRefresh(()=>router.refresh());
    } catch { setError("연결을 확인하고 다시 시도하세요. 입력 내용은 유지됩니다."); }
    finally { setBusy(false); }
  }
  function selectOnMap(id: string) { setSelected(id);setMapView(true); }
  return <div className="restaurant-library" aria-busy={busy}>
    {refreshing ? <LoadingStatus label="저장한 내용 반영 중…" className="rl-feedback" /> : message && <p className="rl-feedback" role="status">{message}</p>}
    {!editable && <p className="rl-muted">읽기 전용입니다.</p>}
    <div className="rl-mobile-switch"><button aria-pressed={!mapView} onClick={()=>setMapView(false)}>목록 보기</button><button aria-pressed={mapView} onClick={()=>setMapView(true)}>지도 보기</button></div>
    <div className="rl-layout">
      <aside className="rl-regions"><h2>지역별 보기</h2><nav aria-label="지역별 맛집">
        {["",...regions].map(value=><button key={value} aria-pressed={activeRegion===value} onClick={()=>setRegion(value)}><span>{value||"전체"}</span><small>{restaurants.filter(r=>!value||regionName(r.region)===value).length}</small></button>)}
      </nav><div className="rl-summary"><span>나의 보관함</span><strong>{restaurants.length}곳 저장 · {restaurants.filter(r=>scheduledItem(r)).length}곳 예정</strong><p>저장한 맛집을<br/>여행 일정에 연결하세요.</p></div></aside>
      <section className={`rl-list ${mapView?"rl-mobile-hidden":""}`} aria-label="맛집 목록">
        <div className="rl-heading"><div><h2>{activeRegion||"저장한 맛집"}</h2><p>여행에서 가보고 싶은 곳</p></div>{editable&&<button className="rl-primary" onClick={()=>open("save")}>맛집 저장</button>}</div>
        <input className="rl-search" aria-label="저장한 맛집 검색" placeholder="맛집 이름이나 메뉴 검색" value={query} onChange={e=>setQuery(e.target.value)}/>
        <div className="rl-filters">{[{value:"all",label:"전체"},{value:"wish",label:"가고 싶은 곳"},{value:"planned",label:"일정에 추가됨"}].map(f=><button key={f.value} aria-pressed={status===f.value} onClick={()=>setStatus(f.value)}>{f.label}</button>)}<span>{visible.length}곳</span></div>
        <label className="rl-day-filter">방문 날짜<select aria-label="맛집 방문 날짜" value={date} onChange={e=>setDate(e.target.value)}><option value="">모두</option>{days.map(d=><option key={d.date} value={d.date}>Day {d.index+1} · {d.shortLabel}</option>)}</select></label>
        {visible.length===0&&<div className="rl-empty"><h3>{restaurants.length?"조건에 맞는 맛집이 없습니다":"첫 맛집을 저장해 보세요"}</h3><p>{restaurants.length?"다른 지역이나 날짜를 선택해 보세요.":"장소를 검색하거나 이름과 지역을 직접 입력할 수 있습니다."}</p>{editable&&!restaurants.length&&<button onClick={()=>open("save")}>맛집 저장하기</button>}</div>}
        {visible.map(r=><article key={r.id} id={`restaurant-${r.id}`} className={`rl-card ${current?.id===r.id?"rl-selected":""}`}>
          <span className="rl-number">{String(restaurants.indexOf(r)+1).padStart(2,"0")}</span>
          <h3>{r.name}{r.original_name&&r.original_name!==r.name&&<span className="rl-original">({r.original_name})</span>}</h3>
          <p className={scheduledItem(r)?"rl-scheduled":"rl-muted"}>{mealLabel(r)}</p>
          <p className="rl-meta">{regionName(r.region)}{r.menu&&` · ${r.menu}`} · {RESERVATION_LABELS[r.reservation_status]}</p>{r.reservation_note&&<p className="rl-note">{r.reservation_note}</p>}{r.reservation_url&&<a className="rl-booking" href={r.reservation_url} target="_blank" rel="noopener noreferrer">예약·매장 안내 확인</a>}
          {r.note&&<p className="rl-note">{r.note}</p>}
          <div className="rl-actions">{editable&&<button onClick={()=>open("schedule",r)}>{scheduledItem(r)?"식사 일정 변경":"일정에 추가"}</button>}{r.latitude!==null?<button onClick={()=>selectOnMap(r.id)}>지도에서 보기</button>:<span className="rl-muted">위치 미등록</span>}
            {editable&&<details><summary aria-label={`${r.name} 더보기`}>더보기</summary><div><button onClick={()=>open("save",r)}>맛집 정보 수정</button>{scheduledItem(r)&&<button onClick={()=>open("unschedule",r)}>일정에서 빼기</button>}<button onClick={()=>open("delete",r)}>보관함에서 삭제</button></div></details>}
          </div>
        </article>)}
      </section>
      <aside className={`rl-map ${mapView?"":"rl-mobile-hidden"}`} aria-label="맛집 지도">
        <div className="rl-map-header"><h2>{activeRegion||"전체"} 맛집 위치</h2><span>{points.length}곳 표시</span></div>
        <div className="rl-map-canvas">{(desktop || mapView) && <TripMap points={points} timezone={trip.timezone} className="h-[400px]" selectedId={current?.id??null} recenter onSelect={id=>{setSelected(id);document.getElementById(`restaurant-${id}`)?.scrollIntoView({behavior:"smooth",block:"nearest"});}} caption="restaurant"/>}</div>
        <div className="rl-map-detail">{current?<><h3>{restaurantName(current)}</h3><p>{current.address||regionName(current.region)}</p><p>{mealLabel(current)}</p>{editable&&<button onClick={()=>open("schedule",current)}>{scheduledItem(current)?"식사 일정 변경":"식사 일정에 추가"}</button>}</>:<p>목록이나 지도에서 맛집을 선택하세요.</p>}</div>
        <div className="rl-map-date"><label>방문 날짜<select aria-label="지도 방문 날짜" value={date} onChange={e=>setDate(e.target.value)}><option value="">모두</option>{days.map(d=><option key={d.date} value={d.date}>Day {d.index+1} · {d.shortLabel}</option>)}</select></label></div>
      </aside>
    </div>
    <dialog ref={dialog} className="rl-dialog" onCancel={e=>{if(busy)e.preventDefault();else setModal(null);}}>
      {modal&&<><div className="rl-heading"><h2>{modal.mode==="save"?(modal.restaurant?"맛집 정보 수정":"맛집 저장"):modal.mode==="schedule"?"식사 일정 연결":modal.mode==="delete"?"보관함에서 삭제":"일정에서 빼기"}</h2><button disabled={busy} onClick={()=>setModal(null)}>닫기</button></div>
        {error&&<p role="alert" className="rl-error">{error}</p>}
        {saving&&<LoadingStatus label="저장 중…" className="py-3" />}
        {modal.mode==="save"?<RestaurantForm key={modal.restaurant?.id??"new"} trip={trip} value={modal.restaurant} defaultRegion={activeRegion} regions={regions} busy={busy} onSubmit={data=>submit("save",data)}/>:modal.mode==="schedule"&&modal.restaurant?<MealForm key={modal.restaurant.id} trip={trip} value={modal.restaurant} busy={busy} onSubmit={data=>submit("schedule",data)}/>:<><p>{modal.restaurant&&restaurantName(modal.restaurant)}</p><p className="rl-muted">{modal.mode==="delete"?"보관함에서만 삭제합니다. 이미 추가한 일정은 유지됩니다.":"연결된 식사 일정은 삭제하고 맛집은 보관함에 남깁니다."}</p><button disabled={busy} className="rl-primary rl-confirm" onClick={()=>submit(modal.mode as "delete"|"unschedule",{})}>{busy?"처리 중…":"확인"}</button></>}
      </>}
    </dialog>
  </div>;
}

type SaveData = { reservationStatus:string;reservationNote:string;reservationUrl:string;name:string; originalName:string;region:string;menu:string;note:string;address:string;latitude:number|null;longitude:number|null };
function RestaurantForm({trip,value,defaultRegion,regions,busy,onSubmit}:{trip:TripDetail;value:SavedRestaurant|null;defaultRegion:string;regions:string[];busy:boolean;onSubmit:(data:SaveData)=>void}) {
  const [searching,setSearching]=useState(false);
  const [data,setData]=useState({reservationStatus:value?.reservation_status??"unknown",reservationNote:value?.reservation_note??"",reservationUrl:value?.reservation_url??"",name:value?.name??"",originalName:value?.original_name??"",region:value?.region??defaultRegion,menu:value?.menu??"",note:value?.note??"",address:value?.address??"",latitude:value?.latitude?.toString()??"",longitude:value?.longitude?.toString()??""});
  function set(key:keyof typeof data,text:string){setData(current=>({...current,[key]:text}));}
  function choose(place:PlaceSearchResult){
    setData(current=>({...current,name:place.name,originalName:/[\u3400-\u9fff]/.test(place.name)&&!/[가-힣]/.test(place.name)?place.name:"",address:place.roadAddress||place.address||"",latitude:String(place.latitude),longitude:String(place.longitude)}));setSearching(false);
  }
  if(searching)return <><button onClick={()=>setSearching(false)}>직접 입력으로 돌아가기</button><PlaceSearch tripId={trip.id} defaultDate={trip.startDate} timezone={trip.timezone} polls={[]} initialQuery={`${trip.destinationName??""} ${defaultRegion}`} onSelect={choose}/></>;
  function save(e:FormEvent<HTMLFormElement>){e.preventDefault();onSubmit({...data,latitude:data.latitude.trim()?Number(data.latitude):null,longitude:data.longitude.trim()?Number(data.longitude):null});}
  return <form onSubmit={save}><fieldset disabled={busy}>
    <button type="button" className="rl-find" onClick={()=>setSearching(true)}>장소 검색으로 찾기</button>
    <p className="rl-muted">검색한 장소의 주소와 지도 위치를 함께 저장합니다.</p>
    <label>맛집 이름 · 한글<input required maxLength={100} value={data.name} onChange={e=>set("name",e.target.value)} placeholder="한글 이름"/></label>
    <label>현지 이름 · 한자 (선택)<input maxLength={100} value={data.originalName} onChange={e=>set("originalName",e.target.value)}/></label>
    <label>지역<input required list="restaurant-regions" maxLength={80} value={data.region} onChange={e=>set("region",e.target.value)} placeholder="예: 가오슝"/></label><datalist id="restaurant-regions">{regions.map(r=><option key={r} value={r}/>)}</datalist>
    <label>대표 메뉴<input maxLength={200} value={data.menu} onChange={e=>set("menu",e.target.value)}/></label>
    <label>예약 가능 여부<select aria-label="예약 가능 여부" value={data.reservationStatus} onChange={e=>set("reservationStatus",e.target.value)}>{Object.entries(RESERVATION_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label>예약 안내<input maxLength={500} value={data.reservationNote} onChange={e=>set("reservationNote",e.target.value)} placeholder="예약 방법, 확인한 날짜 등"/></label>
    <label>예약·매장 안내 링크<input type="url" maxLength={500} value={data.reservationUrl} onChange={e=>set("reservationUrl",e.target.value)} placeholder="https://"/></label>
    <p className="rl-muted">예약 가능 표시는 예약 완료를 뜻하지 않습니다.</p>
    <label>메모<textarea rows={3} maxLength={2000} value={data.note} onChange={e=>set("note",e.target.value)}/></label>
    <label>주소<input maxLength={300} value={data.address} onChange={e=>set("address",e.target.value)}/></label>
    <details className="rl-coordinates"><summary>지도 위치 {data.latitude&&data.longitude?"등록됨":"직접 입력"}</summary><div className="rl-form-row"><label>위도<input type="number" step="any" min={-90} max={90} required={!!data.longitude} value={data.latitude} onChange={e=>set("latitude",e.target.value)}/></label><label>경도<input type="number" step="any" min={-180} max={180} required={!!data.latitude} value={data.longitude} onChange={e=>set("longitude",e.target.value)}/></label></div></details>
    {value?.item_id&&<p className="rl-muted">보관함 정보만 수정합니다. 이미 추가한 일정의 장소·메모는 일정에서 수정하세요.</p>}
    <button className="rl-primary rl-confirm" type="submit">{busy?"저장 중…":"보관함에 저장"}</button>
  </fieldset></form>;
}
function MealForm({trip,value,busy,onSubmit}:{trip:TripDetail;value:SavedRestaurant;busy:boolean;onSubmit:(data:Record<string,unknown>)=>void}) {
  const item=scheduledItem(value),days=tripDays(trip.startDate,trip.endDate);
  const local=item?utcToZonedLocal(item.start_at,trip.timezone):"";
  const [date,setDate]=useState(days.some(d=>d.date===local.slice(0,10))?local.slice(0,10):trip.startDate);
  const [meal,setMeal]=useState<Meal>(value.meal??"점심");
  const [time,setTime]=useState(local.slice(11,16)||MEAL_TIMES[meal]);
  return <form onSubmit={e=>{e.preventDefault();onSubmit({local:`${date}T${time}`,meal});}}><fieldset disabled={busy}>
    <p>{restaurantName(value)}</p><label>방문 날짜<select aria-label="방문 날짜" value={date} onChange={e=>setDate(e.target.value)}>{days.map(d=><option key={d.date} value={d.date}>Day {d.index+1} · {d.shortLabel} ({d.weekday})</option>)}</select></label>
    <span className="rl-form-label">식사 구분</span><div className="rl-meals" role="group" aria-label="식사 구분">{MEALS.map(m=><button type="button" key={m} aria-pressed={meal===m} onClick={()=>{setMeal(m);setTime(MEAL_TIMES[m]);}}>{m}</button>)}</div>
    <label>방문 시간 · {trip.timezone}<input type="time" required value={time} onChange={e=>setTime(e.target.value)}/></label>
    <p className="rl-muted">일정에 추가해도 보관함에 남습니다.</p><button className="rl-primary rl-confirm" type="submit">{busy?"저장 중…":"식사 일정에 연결"}</button>
  </fieldset></form>;
}
