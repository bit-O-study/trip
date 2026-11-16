# 일정 상세의 다음 장소 길찾기

확인일: 2026-11-16

- 각 일정 상세에서 다음 일정까지의 구간만 편집·조회한다. 상세의 지도를 펼친 뒤에만 경로 요청을 보낸다.
- Google Maps JavaScript Routes 라이브러리의 `Route.computeRoutes`로 실제 경로와 승하차·도보 정보를 표시한다. 단순 직선을 길찾기 결과로 표시하지 않는다. 사용자가 저장한 번호·노선은 추천 경로를 강제로 지정하는 값이 아니다.
- 대중교통은 일정 종료 시각을 출발 시각으로 전달한다. 시각이 없으면 현재 기준임을 명시하고, 지원 날짜 범위 밖에서는 다른 날짜로 대체하지 않는다.
- 운영 키 실측: Maps SDK는 로드되나 `ROUTES_COMPUTE_ROUTES: PERMISSION_DENIED` 반환. Google Cloud에서 Routes API 사용 설정 및 해당 브라우저 키의 API 제한 확인이 필요하다. 외부 Google Maps 길찾기 URL은 API 키 없이 출발·도착·수단을 전달한다.
- 조회 실패·15초 지연은 안내와 외부 길찾기 링크로 처리한다. 신규 API 활성화나 결제 설정 변경은 수행하지 않았다.
- 배포는 기존 이동 데이터를 보존하는 `route_label` 컬럼 추가를 먼저 적용하고 앱을 교체한다. 마이그레이션 실패 시 앱 교체를 중단한다.

근거: [Routes 안내](https://developers.google.com/maps/documentation/javascript/routes/route-class-overview), [Routes 참조](https://developers.google.com/maps/documentation/javascript/reference/route), [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
