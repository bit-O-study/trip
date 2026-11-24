# 디자인 개편 시안 (2026-11-18 ~ 11-24)

앱 전체를 새로 디자인한 **웹 시안**의 원본이다. **실제 앱(`src/`)에는 적용하지 않았다.** 구현 전에 방향을 정하기 위한 참고 자료이며, 코드와 충돌하면 `docs/architecture.md`가 기준이다.

- 캔버스: https://claude.ai/artifact/TqNbhGJGg7ZyQKCMkrS5bR (소유자만 열 수 있다. 공유는 페이지의 Share 메뉴에서)
- 화면 27개: `boards/*.dc.html`, 배치 정보: `canvas.json`

## 방향: 여행 수첩 + 탑승권

| 항목 | 값 |
|---|---|
| 배경 / 카드 | `#F6F2EA` 종이 / `#FFFDF8` |
| 글자 / 보조 글자 | `#1C1B18` / `#5E594F` |
| 주요 동작 | 여행 초록 `#0E5A52` |
| 선, 칩 | `#E3DBCB`, `#ECE5D6` |
| 입력·체크박스 테두리 | `#857B66` (3:1 이상) |
| 제목 글꼴 | Noto Serif KR 700 |
| 본문 글꼴 | IBM Plex Sans KR |
| Day 1~5 | `#D2452D` `#0F7C86` `#7A4FC2` `#8F6200` `#2F63C8` |
| 다크 Day 1~5 | `#F0705A` `#3FB5C0` `#A98BE8` `#D9A03A` `#6E9BEF` (글자는 `#14130F`) |

Day 색은 구현할 때 `src/lib/day-color.ts` 한 곳에서만 정의한다 (프로젝트 규칙). 이 시안의 5색은 현재 8색 팔레트(`globals.css`의 `--day-1…8`)를 대체하는 제안이다.

## 화면 목록

| 묶음 | 파일 |
|---|---|
| 진입 | `Main`(홈), `Login`, `NewTrip`, `Account` |
| 여행 | `Schedule`, `ScheduleDesktop`, `Tablet`, `AddItem`, `ItemEdit`, `Flight` |
| 준비물·맛집·지출 | `Packing`, `Restaurants`, `Expenses`, `ExpenseAdd`, `ExpensesDesktop` |
| 공유·회고 | `Members`, `Shared`, `Recap`, `RecapDone` |
| 다크 모드 | `HomeDark`, `ScheduleDark`, `PackingDark`, `ExpensesDark` |
| 데스크톱 | `HomeDesktop`, `ScheduleDesktop`, `ExpensesDesktop` |
| 상태·기준 | `States`(빈 상태·오류·로딩·오프라인), `System`(색·글꼴·부품), `A11y`(접근성 점검) |

`Main`, `Packing`, `Expenses`, `Restaurants`, `AddItem`, `ExpenseAdd`, `Members`, `Account`, `ItemEdit`은 눌러 볼 수 있다.

## 시안 데이터에 대해

- 일정의 장소·시각·항공 정보, 맛집 이름은 **예시**다.
- 금액(지출 8건, 합계 1,617,120원)과 숙소 이름은 실제 입력값이다.
- 회고의 "하루 한 줄"과 복제 기능은 아직 구현되지 않은 **제안**이다. 오프라인 화면도 현재 앱이 지원하지 않는 기능을 보여준다.

## 파일을 여는 방법

`boards/*.dc.html`은 Claude 디자인 캔버스 전용 형식이라 `./support.js`(캔버스 런타임)가 있어야 렌더링된다. 이 저장소에는 그 파일이 없으므로 브라우저로 직접 열면 비어 보인다. 위 캔버스 링크에서 보거나, 소스를 읽는 용도로 쓴다.

## 접근성 점검

`tools/contrast.cjs`로 색 대비를 계산한다 (`node docs/design/tools/contrast.cjs`). 글자는 모두 4.5:1 이상이고, 입력창·체크박스 테두리는 기존 베이지(1.6:1, 2.2:1)가 기준 미달이라 `#857B66`(종이 3.7:1, 카드 4.1:1)으로 바꿨다. Day 1 빨강 위 흰 글자는 4.54:1로 겨우 통과하므로 구현 시 더 진한 빨강을 검토한다. 화면 읽기 프로그램으로는 아직 확인하지 않았다.

## 구현할 때의 순서 제안

1. 색·글꼴 토큰을 `globals.css`에 반영한다 (다크 포함).
2. 여행 탭, 카드, 버튼, 체크박스 같은 공통 부품을 바꾼다.
3. 화면별로 하나씩 적용하고, 기존 테스트(`src/**/*.test.tsx`)와 E2E의 문구·역할 기대값을 함께 갱신한다.
