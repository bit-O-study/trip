# 여행 일정관리 앱 설계

> 최종 갱신: 2026-08-19
> 외부 API의 가격·쿼터·엔드포인트처럼 변동하는 값은 이 문서에 확정 기재하지 않고 `docs/adr/`에 확인일과 함께 기록한다.

---

## 1. 제품 목표와 MVP

사용자가 여행을 만든 뒤 항공편 번호로 실제 운항편을 찾아 넣고, 지도 검색으로 숙소·맛집·관광지를 추가해 날짜별 타임라인으로 관리하는 **모바일 우선 웹앱**을 만든다.

### MVP 완료 기준

1. 이메일·Google·Kakao 로그인
2. 여행의 도시, 기간, 동행자 관리
3. 편명과 출발일로 항공편 검색 후 일정 저장
4. Kakao 장소 검색으로 숙소·맛집·관광지 저장
5. 날짜별 일정 시간·순서 수정 및 지도 확인
6. 외부 API 결과가 바뀌거나 사라져도 저장된 일정 유지
7. 타임라인 ↔ 지도 양방향 하이라이트

7번을 MVP에 넣는 이유는 이것이 제품의 정체성이기 때문이다. 대부분의 여행앱은 일정과 지도를 별도 탭으로 분리해 **동선이 물리적으로 말이 되는지**를 확인할 수 없게 만든다.

### MVP에 함께 정의해야 하는 요구사항

기능 목록이 아니라 **정책**이라 빠뜨리기 쉽지만, 나중에 넣으면 데이터 모델을 다시 손대게 되는 항목들이다.

| 항목 | 정책 |
|---|---|
| 여행 삭제와 복구 | soft delete(`deleted_at`) 후 30일 보관, 이후 물리 삭제. 휴지통 UI 제공 |
| 동시 편집 충돌 | `UPDATE ... WHERE updated_at = :expected` 원자적 낙관적 잠금. 0건이면 충돌로 처리 (§4) |
| 항공편 검색 실패 | 수동 입력 폼을 **항상** 노출. 자동화는 편의지 필수 경로가 아니다 |
| 장소 폐업·API 소실 | 스냅샷으로 계속 표시하되 "최신 정보 확인 불가" 배지. 삭제하지 않는다 |
| 날짜변경선 통과 항공편 | 도착일이 출발일보다 이르거나 이틀 뒤인 경우를 정상 케이스로 처리 (§4 시간대) |
| 숙박 일정 노출 규칙 | 체크인~체크아웃 사이 모든 날짜에 배너로 노출 (§4 span 항목) |
| 접근성 | 드래그 재정렬의 **키보드 대체 경로 필수**. "위로/아래로 이동", "날짜 변경" 메뉴 제공 |
| 지도 로딩 실패 | 목록 전용 화면으로 자동 폴백. 지도 없이도 모든 기능 사용 가능해야 함 |
| 외부 API 장애·쿼터 소진 | degraded mode — 검색만 비활성화하고 저장된 일정 조회·수동 입력은 유지 |
| 데이터 내보내기 | 여행 전체 JSON 내보내기 |
| 계정 탈퇴 | 단독 소유 여행은 30일 soft delete 후 물리 삭제. 다른 멤버가 있는 여행은 후임 owner 지정 필수, 미지정 시 탈퇴 차단 (§6) |
| 법적 고지 | 개인정보처리방침, 위치정보 이용 고지 |

### 후속 범위

항공편 상태 자동 갱신·지연 알림, 이동시간 충돌 경고, 예약 이메일 가져오기, 경비·환율, 오프라인/네이티브 앱.

---

## 2. 기술 선택

| 영역 | 선택 |
|---|---|
| UI | Next.js App Router, React, TypeScript, Tailwind CSS |
| 인증·DB·실시간 | Supabase Auth, PostgreSQL, Row Level Security |
| 배포 | Vercel |
| 장소 | Kakao Maps JavaScript SDK + Kakao Local REST API |
| 로그인 | Supabase OAuth를 통한 Google·Kakao |
| 항공편 | 서버 측 provider adapter 뒤에 공급자 연결 (→ [ADR-0001](adr/0001-flight-data-provider.md)) |

### 장소 검색을 Kakao로 단일화하는 근거

Kakao Local API 키워드 검색은 `x = 경도`, `y = 위도`의 WGS84 좌표를 반환한다. 지도 SDK와 좌표계가 같아 변환이 필요 없다.

> **정정(2026-08-20, 실측).** 초안에 "페이지당 15건, 최대 45페이지"라고 적었으나 **틀렸다.** 실제로는 페이지당 최대 15건이고 **도달 가능한 결과가 최대 45건**이다. `meta.is_end`가 3페이지에서 `true`가 되고, 4페이지 이후는 앞 페이지와 동일한 문서를 되돌려준다(id 중복 100% 확인). Kakao 문서의 `page: 1~45`는 페이지 수가 아니라 상한 표기이며, 실질 제약은 `meta.pageable_count`(최대 45)다.
>
> 따라서 페이지 번호가 아니라 **`is_end`를 신뢰해** 다음 요청 여부를 정한다. 결과가 45건을 넘으면 화면에서 "검색어를 좁히라"고 안내한다.

**Naver Local Search는 검색 fallback으로 채택하지 않는다.** 제외 근거는 다음과 같다.

- **결과 최대 5건.** `display` 파라미터의 상한이 5다. Kakao의 45건과 9배 차이다.
- **페이지 이동 불가.** `start`를 올려 다음 페이지를 가져올 수 없어 무한스크롤·더보기 UX가 성립하지 않는다.
- **상세정보 부족.** 카테고리 코드, 전화번호, 상세 페이지 링크 등이 Kakao 대비 빈약하다.

> **좌표계는 제외 근거가 아니다.** 네이버 지역검색의 `mapx`/`mapy`는 2023년 8월 이후 **WGS84**를 반환한다(그 이전의 KATECH/TM128 설명은 현재 유효하지 않다). 다만 `1269873882`처럼 **정수 스케일로 내려오므로** 앱 표준 좌표로 정규화하는 처리는 여전히 필요하다.

v1.1에서 Naver는 좌표를 다루지 않는 역할로만 도입한다 — **블로그·이미지 검색으로 장소 카드에 후기 수와 사진 보강.**

> **이미지 취급 정책** — 검색으로 얻은 이미지를 다운로드해 저장하거나 자체 도메인에서 재호스팅하면 저작권·핫링크 문제가 생긴다. v1.1에서는 **원문 링크와 임시 썸네일 표시만 허용**하고, 서버 저장·재호스팅은 하지 않는다. "대표 사진"으로 영구 보관할지는 이용약관 검토를 마친 뒤 별도로 결정한다. 사용자가 직접 올린 사진(`attachments`)에는 이 제약이 적용되지 않는다.

### 좌표계 규칙

```
Kakao Local API → x = 경도(lng), y = 위도(lat), WGS84
Naver 지역검색   → mapx, mapy = WGS84 (정수 스케일, 나눗셈 정규화 필요)
DB 저장 표준     → WGS84 (latitude, longitude) numeric
```

**외부 데이터는 수집 즉시 WGS84 실수값으로 정규화한다. 앱 내부에 좌표 표현은 하나만 존재한다.**

### 쿼터와 모니터링 임계치

| 대상 | 일일 무료 쿼터 | 경고 | 차단 |
|---|---|---|---|
| Kakao Maps Web SDK | 300,000 | 60% (180,000) | — |
| Kakao Local 키워드 검색 | 100,000 | 60% (60,000) | 90% 도달 시 검색 degraded mode |

> **주의: Kakao 무료 쿼터는 개발자 계정에서 최초로 활성화한 앱 1개에만 제공된다.** 개발용·운영용 앱을 따로 만들면 뒤에 만든 앱에는 무료 쿼터가 붙지 않는다. 앱 생성 전략을 먼저 정하고 시작할 것.

수치는 변동 가능하므로 발급 시점에 콘솔에서 확인하고 ADR에 기록한다. 초과 시 대응은 §11 참조.

### 약관 준수

Kakao·Naver 지도 웹페이지를 스크래핑하지 않는다. 약관 위반이며 IP가 차단된다. 별점·리뷰 원문은 어느 공식 API도 제공하지 않으므로 블로그 후기 링크로 대체하는 것이 합법적인 최선이다.

---

## 3. 화면과 사용자 흐름

```text
/                          여행 목록
/login                     로그인·회원가입
/trips/new                 여행 생성
/trips/[tripId]            여행 개요 + 날짜 탭 (데스크톱: 타임라인 + 지도 스플릿)
/trips/[tripId]/day/[date] 날짜별 타임라인 (딥링크·SSR 진입점)
/trips/[tripId]/search     항공편·장소 통합 추가
/trips/[tripId]/map        전체/날짜별 지도 (모바일 전체화면)
/trips/[tripId]/settings   여행 정보·동행자·공유 링크 관리
/share/[token]             공유 토큰 검증 전용 (쿠키 발급 후 /s/... 로 즉시 리다이렉트)
/s/[tripShortId]           읽기 전용 공유 뷰 (URL에 토큰 없음)
```

### 날짜 전환은 라우팅이 아니라 클라이언트 상태

`/day/[date]`는 딥링크·SSR 진입점으로 유지하되, 여행 상세 진입 후의 날짜 탭 전환은 클라이언트 상태 + `history.replaceState`로 처리한다.

계획 단계의 핵심 동작은 **항목을 Day 1에서 Day 2로 옮기는 것**이다. 날짜마다 페이지 네비게이션이 걸리면 지도 인스턴스가 재생성되고(Kakao SDK 초기화 비용), 대상 날짜가 화면에 없어 드래그가 성립하지 않는다. 여행 하나의 일정은 수십 건 규모라 진입 시 일괄 로드해도 부담이 없다.

### 메인 화면 — 스플릿 뷰

```
┌───────────────────────────┬──────────────────────────────────┐
│  Day 1  2/14 (금)         │                                  │
│  ─────────────────────    │        [ Kakao Map ]             │
│  ✈ 08:20 KE703 ICN→NRT   │                                  │
│    ↓ 2h 20m               │      ①──②                       │
│  🏨 13:00 신주쿠 호텔     │        ╲                         │
│    ↓ 도보 8분 ⚠           │         ③───④                   │
│  🍜 14:00 이치란라멘      │                                  │
│    ↓ 지하철 22분          │      ● Day1  ● Day2  ● Day3      │
│  🗼 16:30 도쿄타워        │                                  │
│                           │   [Day필터] [카테고리칩] [전체]  │
│  Day 2  2/15 (토)   ▼    │                                  │
└───────────────────────────┴──────────────────────────────────┘
```

- **양방향 하이라이트** — 타임라인 항목 hover 시 해당 마커 확대, 마커 클릭 시 타임라인 항목으로 스크롤·강조.
- **Day별 색상 코딩** — 마커에 `①②③` 방문 순번을 찍고 폴리라인으로 연결한다. 하루 동선이 지그재그면 눈으로 즉시 확인된다.
- **연결선은 "방문 순서 연결선"이지 이동 경로가 아니다.** Phase 2에서 길찾기 API를 붙이기 전까지는 단순 직선이다. 사용자가 실제 경로로 오해하지 않도록 범례에 "방문 순서"라고 표기하고, 점선 스타일로 그려 경로선과 시각적으로 구분한다. 길찾기가 붙은 뒤에도 실제 경로를 받은 구간만 실선으로 전환한다.
- **필터 칩** — Day 토글, 카테고리 토글. "전체 보기"가 곧 맛집지도 뷰다.
- **마커 클러스터링** — 밀집 지역에서 마커가 겹치므로 Kakao `MarkerClusterer`를 적용한다.
- **재정렬** — 드래그 앤 드롭으로 `sort_order`를 갱신하되, **키보드 전용 대체 경로를 함께 제공한다.** 항목 포커스 후 메뉴에서 "위로 이동 / 아래로 이동 / 다른 날짜로 이동". 드래그만 제공하면 접근성 요구를 충족하지 못한다.
- **지도 로딩 실패** — SDK 로드 실패나 쿼터 소진 시 목록 전용 레이아웃으로 폴백한다.

**모바일** — 지도를 전체 화면으로 깔고 바텀시트를 3단계(peek / half / full)로 운용한다.

### 추가 흐름

```text
항공편:   편명 + 날짜 -> 서버 검색 -> 후보 선택 -> 스냅샷 저장
          (검색 실패 시 수동 입력 폼으로 전환)
장소:     키워드/카테고리 -> 지도에서 선택 -> 방문 시간 -> 스냅샷 저장
직접입력: 제목 + 시간 + 위치/메모(선택) -> 저장
```

---

## 4. 데이터 모델

### 스냅샷 전략

**`places`는 정규화된 공유 엔티티, `itinerary_items.place_snapshot`은 선택 시점의 불변 사본**으로 역할을 나눈다.

앞선 초안은 `places`를 append-only로 두려 했으나, 같은 장소를 여러 사용자가 추가하면 행이 무한 증식하고 중복 제거·검색이 불가능해진다. 반대로 `places`만 두고 갱신하면 저장된 일정이 바뀌어 MVP 기준 6번이 깨진다.

두 역할을 분리하면 둘 다 해결된다.

- `places` — `(provider, provider_place_id)` 유니크. 갱신해도 안전하다. 검색·중복 제거·"이 장소를 담은 다른 여행" 같은 기능의 기반이 된다.
- `itinerary_items.place_snapshot jsonb` — 사용자가 선택한 순간의 이름·주소·좌표·카테고리 전체 사본. **한 번 쓰면 수정하지 않는다.** 화면 표시의 기본 소스이며, `places`가 갱신되거나 외부 API에서 사라져도 일정은 그대로 유지된다.
- UI는 스냅샷을 표시하고, `places`의 현재 값과 다르면 "최신 정보가 변경되었습니다 — 갱신" 액션을 제공한다.

항공편도 동일 원칙을 적용한다. `flights`는 공유 엔티티, `itinerary_items`는 선택 시점 스냅샷을 보유한다.

### 테이블

```
-- profiles 는 만들지 않는다. 헬쑤의 public.profiles 를 공유한다 (§7).
-- 아래 테이블은 모두 profiles 가 아니라 auth.users 를 참조한다.

trips
  id, owner_id
  title, description, cover_image_url
  destination_name
  start_date, end_date, timezone
  base_currency                      -- 기본 통화
  status                             -- planning | ongoing | completed
  archived_at, deleted_at            -- 보관 / soft delete
  created_at, updated_at

trip_members
  trip_id, user_id
  role                               -- owner | editor | viewer
  joined_at

trip_invites                         -- 회원 초대 (계정에 귀속)
  id, trip_id, created_by
  token_hash, role
  max_uses, used_count
  expires_at, accepted_at, revoked_at
  created_at

trip_share_links                     -- 공개 읽기 링크 (계정 무관)
  id, trip_id, created_by
  token_hash
  expires_at, revoked_at
  last_accessed_at, access_count
  created_at

itinerary_items
  id, trip_id, created_by
  type                               -- flight | lodging | food | activity | transport | memo
  status                             -- confirmed | tentative | candidate | cancelled
  source                             -- kakao | flight_api | manual | imported
  share_visibility                   -- visible | hidden  (공개 공유 링크 노출 여부)
  title, note
  location_text                      -- place 없이 위치만 적는 경우 ("공항 3층 만남의 광장")
  start_at, end_at, timezone, all_day
  sort_order                         -- numeric, 간격 배치 (아래 "정렬 순서" 참고)
  place_id, place_snapshot           -- FK + 선택 시점 사본
  flight_id, flight_snapshot
  reservation_code
  created_at, updated_at, deleted_at

places                               -- 공유 엔티티, 갱신 가능
  id
  provider, provider_place_id        -- UNIQUE(provider, provider_place_id)
  name, category, category_group
  address, road_address, phone, url
  latitude, longitude                -- WGS84
  raw jsonb                          -- 공급자 원문
  created_at, updated_at, last_fetched_at

flights                              -- 공유 엔티티
  id
  provider, provider_flight_id
  marketing_flight_number            -- 판매 편명 (사용자가 티켓에서 보는 값)
  operating_flight_number            -- 운항 편명 (코드셰어 시 실제 운항사)
  flight_number_input                -- 사용자가 입력한 원문 (선행 0 포함, 표시용)
  flight_number_key                  -- 공급자 조회용 정규화 값
  airline_code, operating_airline_code
  departure_airport, departure_terminal, departure_gate, departure_timezone
  arrival_airport,   arrival_terminal,   arrival_gate,   arrival_timezone
  scheduled_departure, estimated_departure, actual_departure
  scheduled_arrival,   estimated_arrival,   actual_arrival
  status
  raw jsonb
  created_at, updated_at, fetched_at

attachments                          -- 티켓·바우처·사진
  id, trip_id, item_id, uploaded_by
  storage_path                       -- Supabase Storage (private bucket)
  file_name, mime_type, size_bytes
  created_at, deleted_at

audit_events                         -- 초대·권한·공유 링크 변경 기록
  id, trip_id, actor_id
  action                             -- invite.created | member.role_changed | share.revoked ...
  target_type, target_id
  metadata jsonb
  created_at
```

**공통 규칙** — 변경 가능한 모든 테이블에 `updated_at`을 두고 트리거로 갱신한다. 사용자 데이터를 담는 테이블에는 `deleted_at`을 두어 soft delete를 지원한다.

**인덱스**

```
itinerary_items(trip_id, start_at, sort_order)  WHERE deleted_at IS NULL
trip_members(user_id, trip_id)
flights(flight_number_key, scheduled_departure)
places(provider, provider_place_id) UNIQUE
trip_share_links(token_hash) UNIQUE
trip_invites(token_hash) UNIQUE
```

### 정렬 순서 (`sort_order`)

`sort_order`를 연속된 정수로 쓰면 항목을 중간에 끼워 넣을 때마다 뒤쪽 전체를 다시 써야 하고, 두 사람이 동시에 같은 위치로 옮기면 값이 충돌한다.

**`numeric` 타입 + 간격 배치**를 사용한다.

- 신규 항목은 `1000, 2000, 3000 …` 간격으로 배치한다.
- 중간 삽입은 **양옆 값의 중간값**을 계산한다 (`1000`과 `2000` 사이 → `1500`, 다시 → `1250`). Postgres `numeric`은 임의 정밀도라 정수·부동소수점과 달리 중간값이 고갈되지 않는다.
- 다만 반복 삽입으로 소수 자릿수가 계속 늘어나면 인덱스와 비교 비용이 나빠진다. **인접 두 값의 차이가 `0.000001` 미만이 되면 해당 `(trip_id, 날짜)` 범위만 `1000` 간격으로 재번호화**한다. 재번호화 범위를 하루로 한정하므로 잠금 구간이 짧다.
- 정렬 키는 `(start_at, sort_order)`다. `sort_order`는 **같은 시각대 항목의 수동 순서**를 정하는 보조 키이지 유일 정렬 키가 아니다.

LexoRank 계열 문자열 랭크도 같은 문제를 풀지만, 하루 항목이 수십 건 규모인 이 앱에서는 `numeric` 쪽이 구현·디버깅 비용이 낮다.

### 동시 편집 충돌 처리

**저장 전에 `updated_at`을 조회해 비교하는 방식은 경쟁 조건을 막지 못한다.** 조회와 갱신 사이에 다른 트랜잭션이 끼어들 수 있다. 비교를 `UPDATE` 문 자체의 조건에 넣어 원자적으로 처리한다.

```sql
update itinerary_items
set    title = :title,
       start_at = :start_at,
       -- ...
       updated_at = now()
where  id = :id
  and  updated_at = :expected_updated_at
  and  deleted_at is null;
```

**영향받은 행이 0건이면 충돌로 처리한다.** 클라이언트에는 최신 레코드를 함께 반환해 "다른 사람이 먼저 수정했습니다 — 최신 내용 보기 / 내 변경 다시 적용" 을 제시한다.

클라이언트는 항목을 읽을 때 받은 `updated_at`을 보관했다가 저장 요청에 `expected_updated_at`으로 실어 보낸다.

### `share_visibility`의 의미

이름이 모호하면 구현자가 "동행자에게도 숨김"으로 오해한다. 범위를 명확히 못 박는다.

- **`share_visibility` = `visible` | `hidden`** 은 **공개 공유 링크(`/share/...`)에서의 노출 여부만** 제어한다. `hidden`이어도 **여행 멤버에게는 항상 보인다.**
- 기본값은 `visible`. 예약번호가 들어간 항목이나 서프라이즈 일정을 링크에서만 가리는 용도다.

**멤버에게도 비공개인 진짜 개인 메모는 이 컬럼으로 구현하지 않는다.** 공유 행에 플래그를 다는 방식은 RLS로 행 단위 격리를 할 수 없어 결국 새는 구조가 된다. 필요해지면 Phase 2에서 별도 테이블로 만든다.

```
item_private_notes                   -- Phase 2
  id, item_id, trip_id, user_id
  body
  created_at, updated_at
  -- RLS: user_id = auth.uid() 인 행만 접근
```

### 편명 처리

**선행 0을 임의로 제거하지 않는다.** 공급자 조회용 정규화 값과 사용자 표시 원문을 모두 보존한다.

```
사용자 입력 "KE 0703"
  → flight_number_input  = "KE 0703"   (표시용 원문 그대로)
  → flight_number_key    = "KE703"     (공백 제거·대문자·선행 0 제거, 조회 전용)
```

공급자에 따라 `KE703`과 `KE0703` 중 하나만 받는 경우가 있으므로, adapter가 두 형태를 순차 시도하도록 한다.

**코드셰어** — `marketing_flight_number`(티켓에 적힌 판매 편명)와 `operating_flight_number`(실제 운항 편명)를 분리 저장한다. 분리하지 않으면 같은 항공편이 두 편명으로 각각 일정에 등록되어 중복이 발생한다. 일정 추가 시 `operating_flight_number` 기준으로 중복을 감지해 경고한다.

### 숙소는 span 항목

`start_at`(체크인) ~ `end_at`(체크아웃)이 여러 날에 걸친다. 타임라인에서는 해당 기간의 각 날짜 상단에 `🏨 신주쿠 호텔 (2/3박)` 배너로 고정 렌더링하고, 지도에서는 그 기간의 모든 Day 필터에 마커를 노출한다. 이 예외를 초기에 처리하지 않으면 이후 타임라인 렌더링 전체를 다시 작성하게 된다.

### 시간대

여행앱 버그의 상당수가 시간대에서 발생한다.

- 저장은 `timestamptz`(UTC), 표시만 변환한다.
- **항공편은 출발지와 도착지의 시간대가 다르다.** `departure_timezone` / `arrival_timezone`을 공항 코드로부터 채워 행에 저장한다. 조회 시점마다 계산하면 공항 데이터가 바뀔 때 과거 일정의 표시가 흔들린다.
- IATA 공항 코드 → 시간대 매핑 테이블(정적 JSON)이 필요하다.
- **날짜변경선 통과를 정상 케이스로 다룬다.** ICN→LAX는 도착일이 출발일과 같거나 이르고, ICN→LAX 복편은 이틀 뒤에 도착할 수 있다. `arrival < departure`를 오류로 처리하면 안 된다.
- E2E 테스트에 자정 넘김, 날짜변경선, DST 경계 케이스를 반드시 포함한다.

---

## 5. 외부 API 경계

브라우저가 비밀키를 직접 사용하지 않도록 항공편과 Kakao REST 검색은 Route Handler 또는 Server Action을 통한다.

```text
src/features/flights/provider.ts       공통 FlightSearchResult 타입
src/features/flights/kac-gw.ts         한국공항공사 GW API 구현
src/features/flights/aerodatabox.ts    해외 구간 fallback
src/features/places/kakao.ts           Kakao Local REST 변환
src/features/places/naver-enrich.ts    블로그·이미지 보강 (v1.1)
```

- 공급자 원문(`raw`)과 앱 표준 타입을 분리한다.
- 사용자/IP별 rate limit을 둔다.
- 검색 실패·장애·쿼터 소진 시 **degraded mode**로 전환한다. 검색만 비활성화하고 저장된 일정 조회와 수동 입력은 계속 동작해야 한다.

### 항공 공급자

**아직 확정하지 않았다.** 후보와 검증 항목은 [ADR-0001](adr/0001-flight-data-provider.md)에 있으며, 실제 샘플 응답으로 12개 항목을 확인한 뒤 결정한다.

특히 유의할 점:

- 기존 `한국공항공사_항공기 운항정보` API는 **2026년 6월 12일 폐기 공지**됐고 `한국공항공사_실시간 항공기 운항정보 조회_GW`로 전환됐다. 기존 URL은 **공지 후 90일만 유지**된다. 인터넷의 기존 예제는 대부분 폐기된 엔드포인트를 가리키므로 신뢰하지 않는다.
- "실시간 운항정보"가 **미래 스케줄을 며칠 앞까지 제공하는지**를 먼저 확인해야 한다. 여행 계획은 수 주~수 개월 전에 세우므로, 당일·익일 데이터만 제공된다면 MVP 기준 3번을 충족하지 못한다.
- AeroDataBox의 가격과 무료 단위는 판매 채널·시점에 따라 달라진다. 이 문서에 수치를 고정하지 않고 발급 시점에 확인해 ADR에 기록한다.

adapter 뒤에 격리되어 있으므로, 공급자 확정이 늦어져도 1~6단계 구현은 진행할 수 있다.

### 항공편 캐시 TTL

출발까지 남은 시간에 따라 계층적 TTL을 적용한다.

```
출발 7일 이상 전   → 24시간   (스케줄 변동이 거의 없음)
출발 1~7일 전      → 6시간    (기재 변경·스케줄 조정이 나타나는 구간)
출발 24시간 이내   → 15분
출발 3시간 이내    → 5분      (게이트·지연 변동 구간)
```

Phase 3에서 Vercel Cron이 임박한 항공편만 배치 갱신한다.

---

## 6. 보안과 RLS

### 기본 정책

- 모든 여행 관련 테이블에 RLS를 적용한다.
- `trip_members`에 포함된 사용자만 여행을 읽는다.
- `owner`/`editor`만 일정을 변경하고 `owner`만 멤버·여행을 삭제한다.
- 서비스 역할 키, 항공·Kakao REST·Naver secret, Vercel token은 서버 전용이다.
- `NEXT_PUBLIC_`에는 Supabase publishable key와 Kakao JavaScript key처럼 공개 가능한 값만 둔다.
- 초대·공유 토큰은 원문 대신 해시를 저장하고, 예약번호는 로그에 남기지 않는다.

### SECURITY DEFINER 헬퍼 함수 요건

`trip_members` 조회를 정책 안에 직접 서브쿼리로 넣으면 `trip_members` 자신의 정책과 **재귀**한다. 멤버십 검사는 `SECURITY DEFINER` 함수로 추출하되, 아래를 모두 지켜야 한다.

- **API로 노출되는 스키마(`public`)가 아닌 private schema에 생성한다.** Supabase도 보안 정의 함수를 노출 스키마에 두지 말 것을 안내한다.
- **`set search_path = ''`** 를 지정한다.
- 함수 내부의 스키마·테이블 참조는 **완전한 이름**으로 쓴다 (`public.trip_members`).
- `PUBLIC`·`anon`에 대한 불필요한 `EXECUTE` 권한을 회수한다.
- **`owner`가 자기 membership을 삭제해 여행이 고아가 되는 상황을 차단한다.** 마지막 owner의 탈퇴·강등을 정책 수준에서 막고, 소유권 이전 경로를 별도로 제공한다.

### `INSERT ... RETURNING`은 SELECT 정책도 통과해야 한다

구현 중 RLS 테스트가 잡아낸 문제다. `trips`의 SELECT 정책을 멤버십 검사만으로 두면, **여행을 만들고 id를 돌려받는 기본 흐름이 실패한다.** 생성자를 owner 멤버로 등록하는 AFTER 트리거가 RETURNING 계산보다 나중에 실행되기 때문이다.

`trips`의 SELECT 정책에 `owner_id = auth.uid()` 조건을 함께 둔다. 부수 효과로 `trip_members` 행이 유실돼도 소유자가 자기 여행에서 잠기지 않는다. **새 테이블에 정책을 추가할 때마다 같은 문제를 확인한다.**

여행 생성자의 owner 멤버십은 애플리케이션 코드가 아니라 **AFTER INSERT 트리거**가 만든다. 두 번의 왕복과 중간 실패 가능성을 없애기 위해서다.

### Kakao JavaScript 키

노출이 전제인 키다. Kakao 콘솔의 **플랫폼 도메인 화이트리스트 등록이 유일한 실질적 보호 장치**이며, 이를 빠뜨리면 키가 도용되어 쿼터가 소진된다.

### 소유권과 계정 탈퇴

여행이 owner 없이 남는 상황을 데이터 수준에서 차단한다.

- 마지막 owner의 **강등·탈퇴를 정책 수준에서 막는다.** 소유권 이전을 먼저 거쳐야 한다.
- **계정 탈퇴 시 소유 여행 처리**
  - 다른 멤버가 있는 여행 → **후임 owner 지정 필수.** 지정하지 않으면 탈퇴를 차단하고 대상 여행 목록을 제시한다.
  - 단독 소유 여행 → 30일 soft delete 후 물리 삭제. 그 기간 안에는 복구할 수 있다.
- 탈퇴 절차 진입 시 데이터 내보내기(JSON)를 먼저 안내한다.

### 공유 링크

`trip_share_links`(공개 읽기 링크)와 `trip_invites`(회원 초대)는 **역할이 다르므로 테이블을 분리**한다. 하나로 합치면 만료·폐기·권한 정책이 뒤섞인다.

**토큰 정책**

- 충분한 entropy의 원본 토큰을 생성하고 **SHA-256 등 단방향 해시만 저장**한다.
- **만료일**과 **수동 폐기(`revoked_at`)** 를 지원한다.
- **토큰 회전**을 지원한다 (기존 링크 무효화 + 새 링크 발급).
- endpoint에 **rate limit**을 적용한다.

**토큰이 로그·기록에 남는 문제**

URL 경로의 토큰은 Vercel 접근 로그, 브라우저 방문 기록, 외부 링크 클릭 시 Referrer 헤더에 그대로 남는다. 경로에 담긴 이상 "비밀"로 취급할 수 없다. 다음을 모두 적용한다.

- **최초 검증 후 토큰 없는 URL로 전환한다.** `/share/[token]` 진입 → 해시·만료·폐기 검증 → 짧은 만료의 **HttpOnly·Secure·SameSite=Lax 세션 쿠키** 발급 → `/s/[tripShortId]` 로 302 리다이렉트. 이후 요청과 브라우저 기록에는 토큰이 남지 않는다.
- `Referrer-Policy: no-referrer` 를 공유 뷰에 적용한다.
- 공유 뷰 안의 모든 외부 링크에 `rel="noreferrer noopener"`.
- **접근 로그에서 토큰 경로를 마스킹**한다 (`/share/****`).
- `Cache-Control: private, no-store`.
- **검색엔진 색인 방지** — `noindex` 메타 + `X-Robots-Tag: noindex, nofollow`.

**응답 필드**

- **화이트리스트 방식**으로 필드를 선별한다. 블랙리스트는 컬럼이 추가될 때마다 새는 구조다.
- 제외 대상: 예약번호, 멤버 정보, `created_by`, `share_visibility = hidden` 항목, 첨부파일, 감사 기록.

**격리**

`/share/...` 는 RLS 우회 경로다. **service role 조회는 공유 전용 서버 모듈 한 곳에 격리**하고(`src/features/share/server.ts` 등), 그 밖의 코드에서는 service role 클라이언트를 import할 수 없게 한다. 일반 요청 경로에서 service role이 쓰이면 RLS 전체가 무력화된다.

### 첨부파일

Supabase Storage의 **private bucket**을 사용한다.

- **object 경로를 `{trip_id}/{item_id}/{uuid}` 형식으로 강제**한다. 경로 첫 세그먼트가 `trip_id`여야 Storage RLS에서 멤버십 검사를 걸 수 있다.
- Storage 정책은 경로의 `trip_id`에 대해 `trip_members` 멤버십을 확인한다 (§ SECURITY DEFINER 헬퍼 재사용).
- 접근은 짧은 만료의 signed URL로만 허용한다.
- 공유 링크 뷰에는 첨부를 노출하지 않는다.
- 업로드 시 MIME 타입과 크기 상한을 검증한다.

### 감사 기록

초대 생성·수락, 권한 변경, 공유 링크 발급·폐기·회전, 소유권 이전은 `audit_events`에 남긴다. 여러 명이 편집하는 여행에서 "누가 이 사람을 초대했는지"를 되짚을 수 없으면 분쟁을 해결할 수 없다.

- **일반 사용자에게 `UPDATE`·`DELETE` 권한을 주지 않는다.** 읽기는 해당 여행의 owner에게만 허용한다.
- **이벤트 생성은 DB 트리거 또는 서버 전용 함수에서만** 수행한다. 클라이언트가 직접 `INSERT`하면 기록을 신뢰할 수 없다.

---

## 7. 환경과 배포 주의점

`.env.local`에는 참고 앱 값 중 필요한 항목만 복사한다.

> **결정 변경(2026-08-19): 헬쑤 Supabase 프로젝트를 공유한다.** 계정(`auth.users`)을 공유해 사용자가 두 앱에서 같은 아이디를 쓰게 하는 것이 목적이다. 이전 초안의 "Trip 전용 프로젝트를 만들라"는 지침은 폐기한다.

### 공유 DB에서의 격리 규칙

계정은 공유하되 **애플리케이션 테이블은 절대 섞지 않는다.**

- **앱 테이블은 `trip` 스키마, SECURITY DEFINER 헬퍼는 `trip_private` 스키마.** `public`에는 아무것도 만들지 않는다.
- **`... on all tables in schema public` 구문을 쓰지 않는다.** 초안의 `revoke all on all tables in schema public from anon, authenticated`는 헬쑤의 모든 테이블 권한까지 회수해 **헬쑤를 즉시 중단시킨다.** 권한은 우리 테이블에만 건다.
- `profiles`처럼 흔한 이름은 `public`에 두면 반드시 충돌한다. 스키마 분리로 원천 차단한다.
- 문제가 생기면 `drop schema trip cascade`로 우리 것만 되돌릴 수 있다.

**추가 설정이 필요하다.** `trip` 스키마를 API로 쓰려면 Supabase 대시보드에서 노출 스키마에 추가해야 한다(Settings → API → Exposed schemas). 클라이언트에는 `db: { schema: "trip" }`를 지정한다.

Storage는 버킷(`trip-attachments`)으로 이미 격리되므로 스키마 분리가 필요 없다.

### 프로필은 헬쑤 것을 공유한다

계정을 공유하므로 표시 이름·아바타도 헬쑤의 `public.profiles`를 그대로 쓴다. **Trip은 자체 프로필 테이블을 만들지 않는다.** 같은 사람의 프로필이 두 벌 존재하면 한쪽만 고쳤을 때 어느 쪽이 맞는지 알 수 없어진다.

Trip의 모든 테이블은 프로필이 아니라 `auth.users`를 참조하므로 FK 의존성은 없다.

**헬쑤 테이블에 정책을 추가하는 방식은 쓰지 않는다.** RLS는 행 단위라 컬럼을 가릴 수 없기 때문이다. `public.profiles`에는 `phone`, `weight_kg`, `body_fat_pct`, `goal`, `banned_at`, `ban_reason` 같은 값이 함께 들어 있어, "같은 여행 멤버끼리 읽기" 정책 한 줄이면 동행자가 상대의 전화번호와 체중까지 전부 읽는다. 여행 앱이 알아야 하는 것은 표시 이름 하나뿐이다.

대신 `trip` 스키마에 **필요한 컬럼만 내보내는 뷰**를 둔다.

```sql
create view trip.member_profiles with (security_barrier = true) as
select p.user_id,
       coalesce(nullif(btrim(p.nickname), ''), nullif(btrim(p.name), '')) as display_name
from public.profiles p
where p.user_id = (select auth.uid())
   or trip_private.shares_trip_with(p.user_id);
```

```ts
supabase.from("member_profiles").select("user_id, display_name")
```

뷰는 소유자 권한으로 실행되어 헬쑤의 "본인 행만" 정책을 우회하므로 접근 통제를 `WHERE` 절에서 직접 한다. **헬쑤의 테이블·정책·권한은 전혀 건드리지 않으며**, 되돌리려면 뷰만 지우면 된다. RLS 테스트가 "헬쑤 원본 테이블은 여전히 본인 행만 보인다"를 함께 검증한다.

### 개발 서버 포트는 3100으로 고정한다

이 개발 머신의 **포트 3000은 다른 프로젝트가 점유**하고 있다. Next.js는 지정한 포트가 막히면 조용히 다음 번호로 옮겨가므로, 포트를 지정하지 않으면 실행할 때마다 주소가 달라진다. 아래 OAuth redirect URL은 정확히 일치해야 하는 값이라 그때그때 바뀌면 로그인이 깨진다.

`package.json`의 `dev`/`start` 스크립트에 `--port 3100`을 고정했다. 포트를 바꾸려면 `package.json`, `playwright.config.ts`, `.env.example`의 `NEXT_PUBLIC_SITE_URL`, 그리고 아래 redirect URL을 함께 고쳐야 한다.

### OAuth URL은 두 종류이며 등록 위치가 다르다

혼동하기 쉬우므로 분리해서 관리한다.

**1) Supabase 대시보드 → Authentication → URL Configuration (Redirect URLs)**
로그인 완료 후 **앱으로 돌아올** 주소다. `signInWithOAuth`의 `redirectTo`가 이 허용 목록과 대조된다.

```text
http://localhost:3100/auth/callback
https://<production-domain>/auth/callback
```

Vercel Preview 배포는 도메인이 매번 바뀌므로 wildcard 패턴을 사용할 수 있다. 운영 주소는 wildcard 대신 **정확한 URL을 등록**하는 것이 권장된다.

**2) Google Cloud Console / Kakao Developers → OAuth callback URL**
공급자가 **Supabase로 돌려보낼** 주소다. 앱 도메인이 아니라 Supabase 프로젝트 주소를 넣는다.

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

Vercel 프로젝트는 별도로 만들고 Preview/Production 환경변수를 분리한다. 기존 앱의 `.vercel` 연결 정보는 복사하지 않는다.

---

## 8. 구현 순서

1. ~~Next.js 기본 앱, 모바일 레이아웃, lint/test 구성~~ **완료**
2. ~~SQL migration과 RLS 테스트 (SECURITY DEFINER 요건 포함)~~ **완료** — Trip 전용 Supabase 프로젝트 생성 후 `npm run db:push` 적용만 남음 (`supabase/README.md`)
3. ~~Supabase SSR 로그인 및 Google/Kakao OAuth~~ **코드 완료** — 실제 로그인 검증은 Supabase 프로젝트 생성과 OAuth 콘솔 URL 2종 등록 후
4. ~~여행 CRUD와 날짜별 타임라인, soft delete·복구~~ **코드 완료** — 실제 DB 연결 후 동작 확인 필요
5. ~~Kakao 장소 검색·지도와 장소 일정 저장~~ **코드 완료**
6. 타임라인 ↔ 지도 양방향 하이라이트, Day 색상·번호 마커, 키보드 재정렬
7. 항공 provider adapter — [ADR-0001](adr/0001-flight-data-provider.md) 검증 완료 후 착수
8. 읽기 전용 공유 링크(`trip_share_links`), 이후 동행자 초대와 권한 검증
9. Playwright 핵심 흐름과 Vercel Preview 배포

각 단계는 타입 검사, 단위 테스트, 최소 한 개의 핵심 E2E 흐름으로 검증한다. RLS는 **권한별 접근 거부 케이스까지** 테스트한다.

---

## 9. 후속 기능

### Phase 2 — 계획 품질

**이동시간 자동 계산과 일정 충돌 감지** — 연속된 두 항목의 좌표로 길찾기 API(Kakao Mobility, 대중교통은 ODsay)를 호출해 이동시간을 타임라인 사이에 표시한다. `이전 종료 + 이동시간 > 다음 시작`이면 경고한다. 여행 계획의 실패는 대부분 물리적으로 불가능한 일정에서 오므로, 이 기능이 제품을 단순 메모장과 구분한다.

**영업시간·휴무일 검증** — Kakao API가 영업시간을 항상 제공하지는 않으므로, 있으면 검증하고 없으면 "영업시간 미확인 — 직접 확인 필요" 배지를 표시한다. 없는 정보를 있는 것처럼 다루지 않는다.

**저장함(Wishlist)** — `itinerary_items.status = candidate`로 표현한다. 지도에 회색 마커로 표시하고 날짜에 배치하면 `confirmed`로 전환된다.

**지도 앱 딥링크**

```text
카카오맵    kakaomap://route?ep={lat},{lng}&by=PUBLICTRANSIT
네이버지도  nmap://route/public?dlat=&dlng=&dname=&appname=
구글맵      https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
```

**동행자 공동 편집과 후보지 투표** — 낙관적 업데이트 + 폴링으로 시작한다. CRDT는 과하다.

### Phase 3 — 자동화

**예약 메일 자동 파싱** — 전용 주소로 예약 확인 메일을 포워딩하면 LLM으로 파싱해 일정에 추가한다. 항공사별 템플릿이 필요 없다. 입력 비용을 0에 수렴시키므로 후속 기능 중 임팩트가 가장 크다.

**항공 지연 푸시 알림.**

**경비·정산** — 다중 통화는 여행 시작일 환율을 스냅샷으로 고정한다. 매일 환율이 변동하면 정산이 종료되지 않는다.

**날씨 연동**, **PWA 오프라인** — 해외에서 데이터가 끊기는 상황이 반드시 발생한다.

### Phase 4 — 회고와 성장

**여행 후 회고 모드** — 항목에 사진과 한 줄 평을 붙이면 동선이 그려진 여행 지도와 사진 타임라인이 완성된다. 사진 EXIF의 GPS·촬영시각으로 자동 매칭한다.

**일정 복제**, **동선 최적화 제안**(TSP 근사, 강제하지 않고 제안만).

---

## 10. 구현 전 결정 항목

| 항목 | 상태 | 결론 / 다음 행동 |
|---|---|---|
| 항공 데이터 공급자와 요금제 | **미결** | [ADR-0001](adr/0001-flight-data-provider.md)의 12개 항목을 실제 샘플 응답으로 검증. GW API 활용 신청 먼저 접수 |
| Supabase 프로젝트 | **결정 변경** | 헬쑤 프로젝트를 공유한다(계정 공유가 목적). 앱 테이블은 `trip`/`trip_private` 스키마로 격리하고 `public`은 건드리지 않는다 (§7) |
| Kakao 단독 검색 vs Naver fallback | 결정 | Kakao 단독. Naver는 결과 5건·페이지 이동 불가·상세정보 부족으로 fallback 부적합. v1.1 후기·사진 보강으로만 도입 |
| 동행자 편집 vs 읽기 공유 | 결정 | 읽기 공유(`trip_share_links`)부터. 구현이 짧고 실시간 충돌 처리가 불필요 |
| `sort_order` 표현 | 결정 | `numeric` + `1000` 간격 배치, 중간값 삽입. 인접 차이 `0.000001` 미만 시 해당 날짜만 재번호화. LexoRank는 이 규모에 과함 |
| `private`의 의미 | 결정 | `share_visibility`(`visible`/`hidden`)로 개명하고 **공유 링크 노출 여부만** 제어. 멤버에게는 항상 보임. 진짜 개인 메모는 Phase 2에 `item_private_notes` 별도 테이블 + 자체 RLS |
| 계정 탈퇴 시 소유 여행 | 결정 | 다른 멤버 있으면 후임 owner 지정 필수(미지정 시 차단), 단독 소유는 30일 soft delete |
| 공유 토큰 로그 노출 | 결정 | 토큰은 검증 전용 경로에서만 쓰고, 쿠키 발급 후 토큰 없는 `/s/[tripShortId]`로 리다이렉트. `no-referrer`·로그 마스킹·`noindex` 병행 |
| Kakao 앱 생성 전략 | **미결** | 무료 쿼터가 계정당 최초 활성화 앱 1개에만 붙으므로, 개발/운영 앱 분리 여부를 먼저 결정 |
| Naver 이미지 영구 저장 | **미결** | v1.1까지는 링크·임시 썸네일만. 영구 보관은 이용약관 검토 후 결정 |

---

## 11. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| 한국공항공사 GW API가 미래 스케줄 미제공 | MVP 기준 3번 미충족 | ADR-0001 4번 항목 우선 검증. 미충족 시 AeroDataBox를 1순위로 |
| 코드셰어 편명 중복 등록 | 같은 항공편이 두 번 표시 | `operating_flight_number` 기준 중복 감지 |
| Kakao 무료 쿼터가 신규 앱에 미적용 | 예상치 못한 과금 | 앱 생성 전략을 사전 확정 (§10) |
| Kakao 쿼터 초과 | 지도·검색 중단 | 60% 경고, 90% 검색 degraded mode, 지도는 목록 폴백. 지속 초과 시 우선 유료 전환 |
| 지도 공급자 전환 필요 | 대체 수단 부재 | MapLibre는 **렌더러일 뿐 타일 공급자가 아니다.** OSM 공식 타일 서버는 상용 트래픽 대상이 아니므로 fallback으로 상정하지 않는다. 전환 시 유료 타일 공급자 선정 또는 자체 호스팅을 별도 과제로 다룬다 |
| 항공 API가 LCC·해외 노선 미커버 | 자동 입력 실패 | 수동 입력 폴백 상시 제공 |
| 영업시간 데이터 부재·부정확 | 잘못된 경고 | "미확인" 상태를 명시하고 추측하지 않음 |
| 시간대·날짜변경선 처리 오류 | 일정이 하루씩 밀림 | UTC 저장, 공항별 timezone 컬럼 보존, E2E 경계 케이스 |
| RLS 정책 재귀 | 여행 조회 전체 실패 | private schema + `search_path = ''` 의 SECURITY DEFINER 헬퍼 |
| 마지막 owner 이탈로 여행 고아화 | 관리 불가 | 마지막 owner 강등·탈퇴 차단, 소유권 이전 경로 제공 |
| 공유 링크로 민감정보 유출 | 예약번호·개인메모 노출 | 화이트리스트 필터링, `no-store`, `noindex`, 만료·폐기·회전 |
| 외부 API 장애·쿼터 소진 | 앱 전체 사용 불가로 체감 | degraded mode — 조회·수동 입력은 항상 동작 |
| 지도·검색 서비스 약관 위반 | 서비스 중단 | 공식 API만 사용, 스크래핑 금지 |

---

## 참고 자료

- [네이버 지역검색 좌표계 변경 공지](https://developers.naver.com/notice/article/12567)
- [네이버 지역검색 결과 5건 제한 공지](https://developers.naver.com/notice/article/7528)
- [Kakao Local API](https://developers.kakao.com/docs/latest/ko/local/dev-guide)
- [Kakao 쿼터](https://developers.kakao.com/docs/ko/getting-started/quota)
- [공공데이터포털 한국공항공사 API 전환 공지](https://www.data.go.kr/bbs/ntc/selectNotice.do?originId=NOTICE_0000000004750)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
