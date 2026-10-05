"use client";

import { useActionState, useState } from "react";
import { PlaceSearch } from "@/features/places/components/place-search";
import type { PlaceSearchResult } from "@/features/places/types";

import { IDLE, type ActionState } from "@/features/trips/action-state";
import { updateItemAction } from "@/features/trips/actions";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType, type ItineraryItem } from "@/features/trips/types";
import { utcToZonedLocal } from "@/lib/datetime";

type Props = {
  item: ItineraryItem;
  timezone: string;
  onCancel: () => void;
};

/** 필드별 오류. 없으면 "입력을 확인하세요" 만 보이고 어디가 틀렸는지 알 수 없다. */
function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p role="alert" className="text-sm text-danger">{errors[0]}</p>;
}

export function ItemEditForm({ item, timezone, onCancel }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateItemAction, IDLE);
  const errors = state.fieldErrors ?? {};
  const [type, setType] = useState<ItemType>(item.type);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<PlaceSearchResult | null>(null);
  const [title, setTitle] = useState(item.title);
  const [location, setLocation] = useState(item.locationText ?? "");
  return (
    <>
    {searching ? <div className="mt-3">
      <PlaceSearch tripId={item.tripId} defaultDate={utcToZonedLocal(item.startAt, timezone).slice(0, 10)} timezone={timezone} polls={[]} initialQuery={title} onSelect={(selected) => {
        setPlace(selected); setTitle(selected.name); setLocation(selected.roadAddress ?? selected.address ?? selected.name); setSearching(false);
      }} />
      <button type="button" onClick={() => setSearching(false)} className="mt-2 rounded-lg border border-border px-3 py-2 text-sm">장소 검색 닫기</button>
    </div> : null}
    <form action={action} className="mt-3 space-y-3 border-t border-border pt-3">
      <input type="hidden" name="selectedPlace" value={place ? JSON.stringify(place) : ""} />
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="tripId" value={item.tripId} />
      <input type="hidden" name="expectedUpdatedAt" value={item.updatedAt} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm"><span>종류</span><select name="type" value={type} onChange={(e) => setType(e.target.value as ItemType)} className="w-full rounded-lg border border-border bg-background px-3 py-2">{ITEM_TYPES.map((type) => <option key={type} value={type}>{ITEM_TYPE_LABELS[type]}</option>)}</select><FieldError errors={errors.type} /></label>
        <label className="space-y-1 text-sm"><span>제목</span><input name="title" required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><FieldError errors={errors.title} /></label>
        <label className="space-y-1 text-sm"><span>{type === "lodging" ? "체크인" : "시작"}</span><input name="startLocal" type="datetime-local" required defaultValue={utcToZonedLocal(item.startAt, timezone)} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><FieldError errors={errors.startLocal} /></label>
        <label className="space-y-1 text-sm"><span>{type === "lodging" ? "체크아웃" : "종료"}</span><input name="endLocal" required={type === "lodging"} type="datetime-local" defaultValue={item.endAt ? utcToZonedLocal(item.endAt, timezone) : ""} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><FieldError errors={errors.endLocal} /></label>
      </div>
      <button type="button" onClick={() => setSearching(true)} className="rounded-lg border border-border px-3 py-2 text-sm">장소 검색해서 변경</button>
      <label className="block space-y-1 text-sm"><span>장소</span><input name="locationText" maxLength={200} value={location} onChange={(event) => { setLocation(event.target.value); setPlace(null); }} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><FieldError errors={errors.locationText} /></label>
      <label className="block space-y-1 text-sm"><span>메모</span><textarea name="note" maxLength={2000} defaultValue={item.note ?? ""} className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2" /><FieldError errors={errors.note} /></label>
      <p className="text-xs text-muted-foreground">시작 날짜를 바꾸면 저장 후 해당 날짜의 일정으로 자동 이동합니다. 장소를 비우면 지도에서도 사라집니다.</p>
      {state.status === "error" ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{pending ? "저장 중…" : "수정 저장"}</button>
        <button type="button" disabled={pending} onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">취소</button>
      </div>
    </form>
    </>
  );
}
