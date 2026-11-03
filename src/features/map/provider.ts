export type MapProvider = "kakao" | "google" | "osm";

/**
 * 어떤 지도를 띄울지.
 *
 * 기본은 국내 Kakao, 해외 Google 이다. 그런데 Kakao 는 사이트 도메인을 콘솔에 등록해야 하고
 * Google 은 결제 계정이 있어야 해서, 배포 환경에 따라 둘 중 하나가 통째로 막히곤 한다.
 * 기본 지도가 실패했으면 키·결제가 필요 없는 OpenStreetMap 으로 넘어가 지도가 사라지지 않게 한다.
 */
export function pickProvider(primary: "kakao" | "google", failed: ReadonlySet<MapProvider>): MapProvider {
  return failed.has(primary) ? "osm" : primary;
}
