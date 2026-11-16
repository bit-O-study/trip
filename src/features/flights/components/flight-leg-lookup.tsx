"use client";
import { useEffect, useRef, useState } from "react";
import { legFlightSchema, flightTime, type LegFlight } from "../leg-flight";
const field="w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-base";
export function FlightLegLookup({defaultDate,initialNumber,onSelect}:{defaultDate:string;initialNumber:string;onSelect:(flight:LegFlight)=>void}) {
  const [number,setNumber]=useState(initialNumber);
  const [date,setDate]=useState(defaultDate);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [results,setResults]=useState<LegFlight[]>([]);
  const request=useRef<AbortController|null>(null);
  useEffect(()=>()=>request.current?.abort(),[]);
  function invalidate(){request.current?.abort();request.current=null;setBusy(false);setResults([]);setMessage("");}
  async function search(){
    if(request.current || !number.trim() || !date)return;
    const controller=new AbortController();request.current=controller;setBusy(true);setResults([]);setMessage("");
    const timer=window.setTimeout(()=>controller.abort(),15000);
    try {
      const response=await fetch(`/api/flights/search?${new URLSearchParams({flightNumber:number.trim(),date})}`,{signal:controller.signal});
      const body=await response.json();
      if(request.current!==controller)return;
      if(!response.ok){setMessage(body.kind==="not_configured" ? "항공편 조회 연결이 필요합니다. 편명은 직접 입력할 수 있습니다." : "항공편을 조회하지 못했습니다. 편명과 출발일을 확인하거나 직접 입력해 주세요.");return;}
      const flights:LegFlight[]=(Array.isArray(body.results)?body.results:[]).flatMap((value:Record<string,unknown>)=>{const parsed=legFlightSchema.safeParse({...value,flightNumber:value.marketingFlightNumber});return parsed.success?[parsed.data]:[];});
      setResults(flights);if(!flights.length)setMessage("해당 날짜의 항공편을 찾지 못했습니다. 직접 입력할 수 있습니다.");
    } catch {if(request.current===controller)setMessage("조회가 지연되거나 연결되지 않았습니다. 다시 시도하거나 직접 입력해 주세요.");}
    finally{window.clearTimeout(timer);if(request.current===controller){request.current=null;setBusy(false);}}
  }
  return <details className="rounded-lg bg-muted/60 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">편명으로 항공편 조회</summary>
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-2"><label className="min-w-0 space-y-1 text-sm"><span>검색 편명</span><input value={number} maxLength={12} onChange={event=>{invalidate();setNumber(event.target.value);}} placeholder="CI165" className={field}/></label><label className="min-w-0 space-y-1 text-sm"><span>출발일</span><input type="date" value={date} onChange={event=>{invalidate();setDate(event.target.value);}} className={field}/></label></div>
      <button type="button" disabled={busy||!number.trim()||!date} onClick={search} className="min-h-11 rounded-full border border-border bg-card px-4 text-sm disabled:opacity-50">{busy?"조회 중…":"항공편 찾기"}</button>
      {busy&&<p role="status" className="text-xs text-muted-foreground">항공편 정보를 불러오는 중…</p>}
      {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
      {results.length>0&&<ul className="space-y-2">{results.map((flight,index)=><li key={index} className="space-y-2 rounded-lg border border-border bg-card p-3"><p className="text-sm font-medium">{flight.flightNumber} · {flight.airlineName}</p><p className="text-xs">{flight.departure.airport} {flightTime(flight.departure)} → {flight.arrival.airport} {flightTime(flight.arrival)}</p><p className="text-xs text-muted-foreground">각 공항 현지 시각</p><button type="button" onClick={()=>onSelect(flight)} className="min-h-11 rounded-full border border-border px-3 text-sm">이 항공편 사용</button></li>)}</ul>}
    </div>
  </details>;
}