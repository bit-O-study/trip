-- Storage: 첨부파일 버킷과 정책
--
-- object 경로는 반드시 `{trip_id}/{item_id}/{uuid}` 형식이다.
-- 첫 세그먼트가 trip_id 여야 경로만 보고 멤버십을 판정할 수 있다.
-- public.attachments 의 CHECK 제약이 같은 규칙을 강제하므로 두 곳이 어긋나지 않는다.

insert into storage.buckets (id, name, public)
values ('trip-attachments', 'trip-attachments', false)
on conflict (id) do nothing;

-- 경로에서 trip_id 를 안전하게 뽑는다.
-- 형식이 어긋난 경로는 null 을 돌려주고, null 은 어떤 멤버십 검사도 통과하지
-- 못하므로 접근이 거부된다. 캐스팅 예외로 정책 평가가 터지는 것을 막는 장치다.
create or replace function private.trip_id_from_storage_path(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  begin
    v_trip_id := pg_catalog.split_part(p_name, '/', 1)::uuid;
  exception
    when others then
      return null;
  end;
  return v_trip_id;
end;
$$;

revoke all on function private.trip_id_from_storage_path(text) from public, anon;
grant execute on function private.trip_id_from_storage_path(text) to authenticated;

-- 읽기는 멤버 전체, 쓰기는 편집 권한이 있는 멤버만.
-- 공개 공유 링크(/s/...)에는 첨부를 노출하지 않으므로 anon 정책은 두지 않는다.

create policy trip_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trip-attachments'
    and private.is_trip_member(private.trip_id_from_storage_path(name))
  );

create policy trip_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trip-attachments'
    and private.can_edit_trip(private.trip_id_from_storage_path(name))
  );

create policy trip_attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'trip-attachments'
    and private.can_edit_trip(private.trip_id_from_storage_path(name))
  )
  with check (
    bucket_id = 'trip-attachments'
    and private.can_edit_trip(private.trip_id_from_storage_path(name))
  );

create policy trip_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trip-attachments'
    and private.can_edit_trip(private.trip_id_from_storage_path(name))
  );
