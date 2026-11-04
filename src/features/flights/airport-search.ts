import data from "./airport-data.json";

/**
 * 공항 이름·도시·코드로 IATA 코드를 찾는다.
 *
 * 편명 검색(유료 공급자 키 필요)과 별개로, 공항 코드를 모르면 직접 입력도 막히므로 내장 데이터를 쓴다.
 * 데이터는 OpenFlights airports.dat(ODbL, https://openflights.org/data)에서 IATA 코드와 IANA 시간대가
 * 있는 공항만 추려 둔 것이다(`airport-data.json`: [iata, 이름, 도시, 나라, 시간대]). 외부 호출이 없어
 * 빠르고, 시간대도 함께 나오므로 "모르는 공항은 여행 시간대로 저장" 하는 문제가 사라진다.
 * 서버 전용(API 라우트에서만 읽는다) — 클라이언트 번들에 들어가지 않는다.
 */
export type AirportHit = {
  iata: string;
  name: string;
  /** "도시, 나라" */
  place: string;
  timezone: string;
};

type Row = readonly [iata: string, name: string, city: string, country: string, timezone: string];
const AIRPORTS = data as unknown as readonly Row[];

/** 한국어로 많이 찾는 도시·나라 → 영문. 값은 도시 또는 나라 이름과 비교한다. */
const KOREAN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  서울: ["seoul"], 인천: ["incheon", "seoul"], 김포: ["gimpo", "seoul"], 제주: ["jeju"], 부산: ["busan"], 김해: ["busan"],
  대구: ["daegu"], 청주: ["cheongju"], 한국: ["south korea"], 대한민국: ["south korea"],
  타이베이: ["taipei"], 타이페이: ["taipei"], 타오위안: ["taipei", "taoyuan"], 송산: ["taipei"], 타이중: ["taichung"], 타이난: ["tainan"],
  가오슝: ["kaohsiung"], 대만: ["taiwan"], 타이완: ["taiwan"],
  도쿄: ["tokyo"], 동경: ["tokyo"], 나리타: ["narita", "tokyo"], 하네다: ["haneda", "tokyo"], 오사카: ["osaka"], 간사이: ["kansai", "osaka"],
  후쿠오카: ["fukuoka"], 삿포로: ["sapporo"], 치토세: ["sapporo", "chitose"], 나고야: ["nagoya"], 오키나와: ["okinawa", "naha"], 나하: ["naha"],
  교토: ["kyoto", "osaka"], 히로시마: ["hiroshima"], 센다이: ["sendai"], 일본: ["japan"],
  방콕: ["bangkok"], 푸켓: ["phuket"], 치앙마이: ["chiang mai"], 태국: ["thailand"], 파타야: ["bangkok", "pattaya"],
  하노이: ["hanoi"], 호치민: ["ho chi minh"], 다낭: ["da nang"], 나트랑: ["nha trang", "cam ranh"], 푸꾸옥: ["phu quoc"], 베트남: ["vietnam"],
  싱가포르: ["singapore"], 쿠알라룸푸르: ["kuala lumpur"], 코타키나발루: ["kota kinabalu"], 말레이시아: ["malaysia"],
  마닐라: ["manila"], 세부: ["cebu"], 보라카이: ["kalibo", "caticlan"], 필리핀: ["philippines"], 발리: ["denpasar", "bali"], 자카르타: ["jakarta"],
  홍콩: ["hong kong"], 마카오: ["macau"], 상하이: ["shanghai"], 베이징: ["beijing"], 칭다오: ["qingdao"], 중국: ["china"],
  괌: ["guam"], 사이판: ["saipan"], 하와이: ["honolulu"], 호놀룰루: ["honolulu"], 시드니: ["sydney"], 멜버른: ["melbourne"],
  파리: ["paris"], 런던: ["london"], 로마: ["rome"], 바르셀로나: ["barcelona"], 마드리드: ["madrid"], 프랑크푸르트: ["frankfurt"],
  뮌헨: ["munich"], 암스테르담: ["amsterdam"], 취리히: ["zurich"], 프라하: ["prague"], 비엔나: ["vienna"], 빈: ["vienna"], 이스탄불: ["istanbul"],
  뉴욕: ["new york"], 로스앤젤레스: ["los angeles"], 엘에이: ["los angeles"], 샌프란시스코: ["san francisco"], 시애틀: ["seattle"],
  라스베이거스: ["las vegas"], 시카고: ["chicago"], 토론토: ["toronto"], 밴쿠버: ["vancouver"], 두바이: ["dubai"],
  울란바토르: ["ulaanbaatar"], 몽골: ["mongolia"], 프랑스: ["france"], 영국: ["united kingdom"], 미국: ["united states"],
};

const norm = (value: string) => value.toLowerCase().replace(/[\s.\-']/g, "");

export function searchAirports(query: string, limit = 12): AirportHit[] {
  const raw = query.trim();
  if (raw.length < 2 && !/^[A-Za-z]{3}$/.test(raw)) return [];
  const q = norm(raw);

  // 한국어 입력은 영문 도시/나라로 바꿔서 같은 규칙으로 찾는다.
  const aliases = Object.entries(KOREAN_ALIASES)
    .filter(([ko]) => raw.includes(ko))
    .flatMap(([, english]) => english.map(norm));

  const scored: { row: Row; score: number }[] = [];
  for (const row of AIRPORTS) {
    const [iata, name, city, country] = row;
    const code = iata.toLowerCase();
    const nameN = norm(name);
    const cityN = norm(city);
    const countryN = norm(country);
    let score = 0;
    if (code === q) score = 100;
    else if (aliases.some((a) => cityN === a || nameN.startsWith(a))) score = 80;
    else if (cityN === q) score = 70;
    else if (aliases.some((a) => countryN === a)) score = 40;
    else if (cityN.startsWith(q) || nameN.startsWith(q)) score = 60;
    else if (nameN.includes(q) || cityN.includes(q)) score = 50;
    else if (countryN === q) score = 30;
    if (!score) continue;
    // 같은 점수면 국제공항을 먼저 — 여행객이 찾는 대부분이 국제선이다.
    if (/international|intl/i.test(name)) score += 5;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row[1].localeCompare(b.row[1]));
  return scored.slice(0, limit).map(({ row: [iata, name, city, country, timezone] }) => ({
    iata,
    name,
    place: `${city}, ${country}`,
    timezone,
  }));
}
