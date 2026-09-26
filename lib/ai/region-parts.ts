/**
 * [1008 · W] 실거래 지역명(market_transactions.region_name) → 입주물량·뉴스 조회용 조각.
 *
 * ── 왜(실측 2026-09-21, 운영 DB 읽기 전용) ─────────────────────────────────────
 * ① 입주 예정: live-context 가 `getSupplyForArea("서울 강남구")` 처럼 **통째 이름**으로 불러
 *    `address ilike '%서울 강남구%'` 가 됐다. 주소는 "서울특별시 강남구 …"·"경기도 안양시 동안구 …"
 *    라 전국 어디서도 0건 — AI 분석의 "입주 대기" 축이 늘 비어 있었다. 시/도·구로 쪼개 부르면
 *    서울 강남구 4건(396세대) · 안양 동안구 5건(4,169세대) · 부산 해운대구 6건 · 세종시 4건(2,441세대).
 *    app/complex/[id]/UpcomingSupply.tsx 가 쓰는 규칙([970 · B-02] area + city)과 같다.
 * ② 뉴스: 지역 뉴스를 `ai_summary ilike '%안양 동안구%'` 로 찾아, 요약 400~500자 뒤에 지역 목록으로
 *    한 번 스친 기사("서울 아파트값 84주 연속 상승…", "삼성전자 5억 사내대출…")가 안양 단지에 붙었다
 *    (소유자 캡처). 제목에 그 지역 낱말이 있는 기사만 지역 뉴스로 본다.
 *
 * 순수 함수 — 서버(live-context)와 단위테스트가 같은 규칙을 본다.
 */

/** 특별·광역시 — 두 낱말 지역명의 앞 낱말이 이것이면 뒤 낱말(구·군)이 그 시 안의 자치구다 */
const METRO = new Set(["서울", "부산", "대구", "인천", "광주", "대전", "울산"]);

/** 여러 도시에 같은 이름이 있는 자치구 — 뉴스 제목에서 구 이름만으로는 어느 도시인지 모른다 */
const AMBIGUOUS_DISTRICT = new Set(["중구", "동구", "서구", "남구", "북구", "강서구", "고성군"]);

/**
 * 제목에서 구 이름 대신 흔히 쓰는 줄임·생활권 이름. 흔한 낱말과 겹치는 것(사상·수영·연수·동작·
 * 달성·강화·장안 …)은 넣지 않는다 — "사상 최대"·"규제 강화" 같은 제목이 붙는다.
 */
const TITLE_ALIASES: Record<string, readonly string[]> = {
  "서울 강남구": ["강남"],
  "서울 서초구": ["서초"],
  "서울 송파구": ["송파", "잠실"],
  "서울 강동구": ["강동"],
  "서울 마포구": ["마포"],
  "서울 용산구": ["용산"],
  "서울 성동구": ["성동", "성수"],
  "서울 광진구": ["광진"],
  "서울 동대문구": ["동대문"],
  "서울 중랑구": ["중랑"],
  "서울 성북구": ["성북"],
  "서울 강북구": ["강북구"],
  "서울 도봉구": ["도봉"],
  "서울 노원구": ["노원"],
  "서울 은평구": ["은평"],
  "서울 서대문구": ["서대문"],
  "서울 양천구": ["양천", "목동"],
  "서울 구로구": ["구로"],
  "서울 금천구": ["금천"],
  "서울 영등포구": ["영등포", "여의도"],
  "서울 관악구": ["관악"],
  "부산 해운대구": ["해운대"],
  "부산 부산진구": ["부산진"],
  "부산 동래구": ["동래"],
  "대구 수성구": ["수성구"],
  "대전 유성구": ["유성구"],
  "인천 연수구": ["송도"],
  "성남 분당구": ["분당"],
  "용인 수지구": ["수지"],
  "용인 기흥구": ["기흥"],
  "수원 영통구": ["영통"],
  "고양 일산동구": ["일산"],
  "고양 일산서구": ["일산"],
  "화성 동탄구": ["동탄"],
  "안양 동안구": ["평촌"],
  세종시: ["세종"],
  남양주시: ["남양주"],
  김포시: ["김포"],
  하남시: ["하남"],
  과천시: ["과천"],
  광명시: ["광명"],
  평택시: ["평택"],
  파주시: ["파주"],
  의정부시: ["의정부"],
};

export interface RegionParts {
  /** 원문(공백 정리) */
  name: string;
  /** 앞 낱말 — "서울"·"안양"·"부산". 한 낱말 지역이면 null */
  city: string | null;
  /** 뒤 낱말(구·군) 또는 한 낱말 지역명 — "강남구"·"동안구"·"세종시" */
  district: string;
  /** 앞 낱말이 특별·광역시인가 */
  metro: boolean;
}

export function regionParts(regionName: string): RegionParts | null {
  const name = (regionName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const parts = name.split(" ");
  if (parts.length >= 2) {
    const city = parts[0];
    return { name, city, district: parts.slice(1).join(" "), metro: METRO.has(city) };
  }
  return { name, city: null, district: name, metro: false };
}

/**
 * 입주물량(apartment_supply) 조회 인자 — getSupplyForArea(area, limit, signal, city) 에 그대로 넣는다.
 * 주소 표기 실측: "서울특별시 강남구 …" · "경기도 안양시 동안구 …" · "세종특별자치시 …" ·
 * "제주특별자치도 제주시 …" · "경기도 남양주시 …". region 컬럼은 시/도("서울"·"경기"·"세종").
 */
export function supplyQueryFor(regionName: string): { area: string; city: string | null } | null {
  const p = regionParts(regionName);
  if (!p) return null;
  if (p.city) return { area: p.district, city: p.city };
  /* 세종은 주소가 "세종특별자치시 …" 로만 적힌다 — "세종시" 로는 한 건도 안 걸린다 */
  if (p.district === "세종시" || p.district === "세종") return { area: "세종특별자치시", city: "세종" };
  if (p.district === "제주시" || p.district === "서귀포시") return { area: p.district, city: "제주" };
  return { area: p.district, city: null };
}

/** 지역 뉴스 **제목**에서 찾을 낱말들(앞에 올수록 구체적) */
export function regionNewsTokens(regionName: string): string[] {
  const p = regionParts(regionName);
  if (!p) return [];
  const out: string[] = [];
  const push = (t: string | null | undefined) => {
    const v = (t ?? "").trim();
    if (v.length >= 2 && !out.includes(v)) out.push(v);
  };
  if (p.city) {
    if (AMBIGUOUS_DISTRICT.has(p.district)) {
      push(`${p.city} ${p.district}`);
      push(`${p.city}${p.district}`);
    } else {
      push(p.district);
    }
    for (const a of TITLE_ALIASES[p.name] ?? []) push(a);
    /* 광역시가 아닌 시(안양·수원·성남…)는 시 이름 자체가 제목에 흔히 나온다 — 같은 시장권이다 */
    if (!p.metro) push(p.city);
  } else {
    push(p.district);
    for (const a of TITLE_ALIASES[p.name] ?? []) push(a);
  }
  return out;
}

/** 단지명 → 뉴스 검색 낱말. "공작아파트" → "공작", 괄호·쉼표 등 PostgREST or() 를 깨는 글자는 뺀다 */
export function complexNewsToken(complexName: string | null | undefined): string | null {
  const raw = (complexName ?? "").replace(/[%,()"'\\*]/g, " ").replace(/\s+/g, "").trim();
  if (!raw) return null;
  const core = raw.replace(/아파트$/, "");
  const token = core.length >= 2 ? core : raw;
  return token.length >= 2 ? token : null;
}

/** or() 필터 안에 넣어도 안전한 낱말(쉼표·괄호·와일드카드 제거) */
export function safeIlikeToken(t: string): string {
  return t.replace(/[%,()"'\\*]/g, "").trim();
}

export interface NewsCandidate {
  title: string;
  summary: string | null;
}

/** 요약 앞부분만 본다 — 지역 목록으로 한 번 스친 기사(요약 400자 뒤)를 거르기 위해 */
export const SUMMARY_HEAD_CHARS = 160;

/**
 * 지역 뉴스 적합성 — 제목에 지역 낱말이 있어야 한다.
 * (요약 깊숙이 지역이 한 번 나오는 기사는 그 지역 기사가 아니다 — 캡처 실측.)
 */
export function isRegionNews(post: NewsCandidate, tokens: readonly string[]): boolean {
  const title = post.title ?? "";
  return tokens.some((t) => t && title.includes(t));
}

/** 단지명 바로 뒤에 오면 회사 이름이다 — "현대건설"·"신동아건설"·"삼성물산"·"롯데그룹" */
const COMPANY_AFTER = /^\s?(?:건설|물산|전자|그룹|증권|산업|중공업|엔지니어링|이앤씨|E&C|홀딩스|자동차|백화점|카드|생명|화재|캐피탈|금융|은행|제약|종합건설|건영|주택|디앤씨|D&C|엔터|제과|쇼핑|케미칼|화학|에너지|정유)/;
/** 단지명 바로 뒤에 오면 아파트 이야기다 — "은마 재건축"·"공작아파트"·"은마 이주" */
const APARTMENT_AFTER = /^\s?(?:아파트|단지|재건축|재개발|리모델링|정비|조합|이주|입주|분양|주민|세입자|전세|매매|신고가|실거래|호가|평형)/;
/**
 * 브랜드만으로 된 이름 — 전국에 같은 이름이 수십 곳이라 이름만으로는 이 단지 기사인지 모른다
 * ("동탄 롯데캐슬" 기사가 서울 중구 롯데캐슬에 붙던 것 · 1008 리뷰 A-12).
 */
const BRAND_ONLY = new Set([
  "현대", "삼성", "롯데", "대림", "한신", "우성", "쌍용", "벽산", "신동아", "주공", "한양", "동아", "극동", "대우",
  "코오롱", "두산", "럭키", "삼익", "미성", "한진", "청구", "경남", "동부", "금호", "진흥", "선경", "효성", "풍림",
  "성원", "대동", "동신", "라이프", "한라", "우방", "부영", "호반", "한화", "중흥", "제일", "대방", "동문", "신안",
  "롯데캐슬", "래미안", "자이", "푸르지오", "아이파크", "힐스테이트", "e편한세상", "이편한세상", "더샵", "센트레빌",
  "꿈에그린", "위브", "우미린", "데시앙", "스위첸", "하늘채", "리슈빌", "해링턴", "수자인", "한라비발디", "서희스타힐스",
  "중흥S클래스", "반도유보라", "금호어울림", "어울림", "SK뷰", "SKVIEW", "롯데캐슬골드", "아너스빌", "유보라", "파밀리에",
]);

/** 글(제목·요약 앞부분)에서 단지명이 **회사 이름이 아닌 자리**로 나온 곳들 — 뒤 글자로 강한 신호인지도 함께 */
function nameHits(text: string, nameToken: string): { strong: boolean }[] {
  const out: { strong: boolean }[] = [];
  let from = 0;
  for (;;) {
    const i = text.indexOf(nameToken, from);
    if (i < 0) break;
    const after = text.slice(i + nameToken.length, i + nameToken.length + 8);
    if (!COMPANY_AFTER.test(after)) out.push({ strong: APARTMENT_AFTER.test(after) });
    from = i + nameToken.length;
  }
  return out;
}

/**
 * 단지 뉴스 적합성 — 제목 또는 요약 앞부분에 단지명이 있어야 한다. 이름 바로 뒤가 "건설·물산·전자·그룹·증권"
 * 같은 회사 꼬리면 그 자리는 세지 않는다("현대건설, 강남 재건축 수주전" 은 현대아파트 기사가 아니다).
 *  · 5글자 이상이고 브랜드만이 아닌 이름(헬리오시티·래미안안양메가트리아) → 그걸로 충분
 *  · 브랜드만인 이름(현대·롯데캐슬·래미안…) → **제목**에 이 지역 낱말(구·동·별칭)이 함께 있어야
 *  · 그 밖의 짧은 이름(은마·공작·남광) → 이름 바로 뒤가 "재건축·아파트·이주…" 이거나, 제목에 지역 낱말
 */
export function isComplexNews(
  post: NewsCandidate,
  nameToken: string,
  regionTokens: readonly string[],
): boolean {
  const title = post.title ?? "";
  const head = (post.summary ?? "").slice(0, SUMMARY_HEAD_CHARS);
  const hits = [...nameHits(title, nameToken), ...nameHits(head, nameToken)];
  if (hits.length === 0) return false;
  const brandOnly = BRAND_ONLY.has(nameToken) || BRAND_ONLY.has(nameToken.replace(/\s+/g, ""));
  if (!brandOnly && nameToken.length >= 5) return true;
  const regionInTitle = regionTokens.some((t) => t && title.includes(t));
  if (brandOnly) return regionInTitle;
  return regionInTitle || hits.some((h) => h.strong);
}
