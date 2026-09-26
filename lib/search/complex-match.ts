/**
 * [1008 · S] 단지 이름 검색 — 질의 해석과 후보 순위 (순수 함수 · 서버·테스트 공용).
 *
 * ── 왜 (실측 2026-09-21) ──────────────────────────────────────────────────
 * /search 검색 11건 중 9건(82%)이 "결과 없음"이었다. 그런데 "E편한세상 사천"(×3)·"사천 스카이"·
 * "한가람삼성"·"그린타운우성"·"벽절골롯데"(오타)는 전부 DB 에 있는 단지다
 * (e편한세상사천스카이마리나·한가람(삼성)·그린타운(우성2)·벽적골롯데). 원인은 둘이었다.
 *   ① 통합 검색의 단지 그룹이 complex_name ILIKE '%원문%' — 띄어쓰기·괄호 한 글자 차이에 0건.
 *   ② 자동완성 RPC 는 트라이그램으로 후보는 모았지만 정렬이 "앞글자 일치 > 유사도"뿐이라
 *      "힐스테이트 광교"→힐스테이트@이천시, "동탄 롯데캐슬"→롯데캐슬@서울 중구,
 *      "목동 7단지"→청학주공(7단지)@남양주가 1위였고, "공작아파트"는 '아파트'를 먼저 떼어
 *      공작@영등포가 공작아파트@안양 위에 섰다.
 *
 * ── 이 파일이 규칙의 원본이다 ─────────────────────────────────────────────
 * DB 함수 search_complexes_preview v3
 * (supabase/migrations/20260921003000_1008_search_complexes_preview_v3.sql — v2 + 시·도 낱말·지역 먼저 해석·
 * 2자 키 구분자)가 같은 규칙을 SQL 로 옮긴 것이다. 표기 표(BRAND_FOLDS·BRAND_ALTS)·시·도 표·등급 번호는
 * tests/unit/complex-search-1008 이 두 쪽을 대조한다 — 한쪽만 고치면 테스트가 깨진다.
 *
 * ── 시·도 낱말 (1008 리뷰 B) ─────────────────────────────────────────────
 * region_name·address 에는 시·도가 없다("사천시", "수원 영통구", "서울 강남구", "광주시"=경기 광주).
 * 그래서 "경남 사천 e편한세상"·"경기도 수원 힐스테이트" 는 '경남'·'경기도' 토큰이 어디에도 안 맞아 전부
 * 비슷한 이름이 됐고, "부산광역시 해운대 자이" 는 0건이었다. 이제
 *   · 도(경기·강원·충북·충남·전북·전남·경북·경남·제주)는 버린다 — 긴 꼴(경기도·경상남도·강원특별자치도…)은
 *     어디서든, 짧은 꼴은 **맨 앞일 때만**("동래 경남" 의 경남은 경남아파트일 수 있다).
 *   · 특별시·광역시·특별자치시는 꼬리만 뗀다(서울특별시→서울 · 부산광역시→부산 · 세종특별자치시→세종) —
 *     "서울 강남구"·"부산 해운대구"·"세종시" 처럼 region_name 첫 낱말이라 지역 토큰으로 그대로 쓸 수 있다.
 *   · 도를 버렸으면 광역·특별시 구(區)는 후보에서 뺀다 — "경기 광주 롯데캐슬" 이 광주광역시 북구 롯데캐슬을
 *     올리지 않게(경기 광주시는 region_name "광주시", 광역시는 "광주 북구").
 *   · 남는 낱말이 없으면(질의가 시·도뿐) 손대지 않는다.
 *
 * ── 등급(작을수록 위) ────────────────────────────────────────────────────
 *   0 정확        정규화 키가 같다 ("한가람삼성" = 한가람(삼성) · "공작아파트" = 공작아파트)
 *   1 꼬리 무시   '아파트'·'N단지' 꼬리를 떼면 같다 ("공작아파트" → 공작 · "목동신시가지7단지" → 목동신시가지7)
 *   2 지역+정확   지역·동 토큰을 빼고 남은 이름이 같다 ("동탄 롯데캐슬" → 롯데캐슬@화성 동탄구)
 *   3 앞부분      ("그린타운우성" → 그린타운(우성2) · "E편한세상 사천" → e편한세상사천스카이마리나)
 *   4 포함        ("사천 스카이" → e편한세상사천스카이마리나)
 *   5 지역+앞부분 ("동탄 롯데캐슬" → 롯데캐슬 알바트로스@화성 동탄구)
 *     토큰이 이름과 지역 둘 다에 있으면 두 가지로 읽어 나은 쪽을 쓴다 — "사천 e편한세상" 의 '사천' 은
 *     e편한세상사천스카이마리나@사천시 의 이름에도 지역에도 있다. 이름으로만 읽으면 등급 6 이라
 *     e편한세상삼천포오션프라임(등급 5) 아래로 밀렸다.
 *   6 토큰 전부   순서 무관 · 이름/지역/주소 어디든 ("목동 7단지" → 목동신시가지7)
 *   7 비슷한 이름 오타 추정 ("벽절골롯데" → 벽적골롯데). 트라이그램 유사도 0.3 미만은 버린다.
 * 같은 등급 안: 이름에 든 토큰 수 → 최근 6개월 거래(등급 7 은 건너뜀) → 유사도 → 전체 거래 → 이름·지역.
 *   왜 유사도보다 거래가 먼저인가: "목동 7단지" 에서 목동동화옥시죤-7(거래 0, 유사도 0.214)이
 *   목동신시가지7(최근 6개월 57건, 유사도 0.154)보다 위에 섰다(2026-09-21 운영 재현). 토큰으로 이미 맞은
 *   후보끼리는 몇 글자 더 닮았는지보다 사람들이 실제로 사고파는 단지인지가 더 좋은 신호다.
 *   등급 7(오타 추정)만은 유사도가 먼저다 — 거기서는 얼마나 닮았는지가 곧 근거다.
 */

/* ── 정규화 ─────────────────────────────────────────────────────────── */

/**
 * 한글·영숫자만 남긴 소문자 키. DB 쪽 표현식
 * `regexp_replace(lower(x), '[^0-9a-z가-힣]', '', 'g')` 와 같은 결과를 낸다
 * (괄호·공백·하이픈·점·&amp; 의 기호가 전부 빠진다: "그린타운(우성2)" → "그린타운우성2").
 */
export function complexNameKey(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

/**
 * 질의 쪽 표기 접기 — 같은 브랜드의 여러 표기를 한 표기로. **순서가 의미 있다**(SQL 과 같은 순서).
 * 표기 실측(2026-09-21 complex_tx_stats_base 36,724행, 정규화 키 기준):
 *   e편한세상 347 · 이편한세상 81 | 아이파크 264 · ipark 34 | skview 58 · sk뷰 9 · 에스케이뷰 33 |
 *   s클래스 54 · 에스클래스 73 | lh 96 · 엘에이치 262 | kcc 45 · 케이씨씨 9 | lg 21 · 엘지 46 |
 *   gs 11 · 지에스 8 | 더샵 230 · thesharp 1 | 푸르지오 497 · prugio 0 | 래미안 224 · raemian 0 |
 *   힐스테이트 352 · hillstate 0 | 롯데캐슬 233 · lottecastle 0.
 * DB 이름은 고치지 않는다 — 질의를 접은 뒤, DB 에 실제로 있는 표기들로 다시 펼쳐(BRAND_ALTS) 찾는다.
 * ("레미안"은 접지 않는다 — 대동레미안 13곳이 실재하는 다른 브랜드다.)
 */
export const BRAND_FOLDS: ReadonlyArray<readonly [from: string, to: string]> = [
  ["이편한세상", "e편한세상"],
  ["ipark", "아이파크"],
  ["에스케이뷰", "skview"],
  ["sk뷰", "skview"],
  ["에스클래스", "s클래스"],
  ["엘에이치", "lh"],
  ["케이씨씨", "kcc"],
  ["엘지", "lg"],
  ["지에스", "gs"],
  ["thesharp", "더샵"],
  ["prugio", "푸르지오"],
  ["raemian", "래미안"],
  ["hillstate", "힐스테이트"],
  ["lottecastle", "롯데캐슬"],
];

/** 접힌 표기 → DB 에 함께 있는 다른 표기(펼치기). 한 단계만 바꾼다(한 질의에 두 브랜드는 드물다). */
export const BRAND_ALTS: ReadonlyArray<readonly [canonical: string, alt: string]> = [
  ["e편한세상", "이편한세상"],
  ["아이파크", "ipark"],
  ["skview", "sk뷰"],
  ["skview", "에스케이뷰"],
  ["s클래스", "에스클래스"],
  ["lh", "엘에이치"],
  ["kcc", "케이씨씨"],
  ["lg", "엘지"],
  ["gs", "지에스"],
  ["더샵", "thesharp"],
];

export function foldBrands(key: string): string {
  let k = key;
  for (const [from, to] of BRAND_FOLDS) k = k.split(from).join(to);
  return k;
}

/** 접힌 키 하나 → [그 키, DB 표기로 한 군데 바꾼 키들] (중복 없음) */
export function brandVariants(folded: string): string[] {
  const out = [folded];
  for (const [c, a] of BRAND_ALTS) {
    if (folded.includes(c)) {
      const v = folded.split(c).join(a);
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

/** '아파트' 꼬리 — 떼고도 2자 이상 남을 때만("공작아파트"→"공작", "아파트"는 그대로) */
export function stripAptTail(k: string): string {
  return k.endsWith("아파트") && k.length - 3 >= 2 ? k.slice(0, -3) : k;
}

/** 'N단지' 꼬리 → 'N' ("목동신시가지7단지"→"목동신시가지7") */
export function stripDanjiTail(k: string): string {
  return k.replace(/([0-9]+)단지$/, "$1");
}

/* ── 질의 글자 정리(길이 상한 · 시·도 낱말) ─────────────────────────────── */

/** 질의 길이 상한 — /api/search/* 가 80자 넘는 입력에 400 을 내고, RPC 도 같은 자리에서 자른다(anon 직접 호출 대비) */
export const COMPLEX_QUERY_MAX = 80;
/** 토큰 상한 — 단지명·동네 검색은 2~3개면 충분하고, SQL 은 토큰마다 후보 갈래가 는다 */
export const COMPLEX_TOKEN_MAX = 6;

/** 도(道) 짧은 꼴 — 질의 **맨 앞**일 때만 버린다(경남아파트·경기아파트 같은 단지명과 겹친다) */
export const PROVINCE_DO_SHORT: readonly string[] = ["경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];
/** 도(道) 긴 꼴 — 단지명과 겹치지 않아 어디서든 버린다. "(짧은 꼴)+도"(경남도·충북도)도 같이 본다. */
export const PROVINCE_DO_LONG: readonly string[] = [
  "경기도",
  "강원도",
  "충청북도",
  "충청남도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주도",
  "강원특별자치도",
  "전북특별자치도",
  "제주특별자치도",
];
/** 특별시·광역시·특별자치시 꼬리 — 떼고 남은 이름(서울·부산·세종…)은 region_name 첫 낱말이라 지역 토큰으로 쓴다 */
const METRO_TAIL = /^(.+?)(특별자치시|특별시|광역시)$/;
/** 광역·특별시의 구·군과 세종 — 도를 버린 질의에서는 후보가 될 수 없다(경기 광주시 = "광주시", 광주광역시 = "광주 북구") */
export const METRO_REGION = /^(서울|부산|대구|인천|광주|대전|울산) |^세종시$/;

/** 남은 낱말이 검색어 구실을 하는가 — '아파트'·'단지'·단지 번호뿐이면 아니다("경남 아파트" 는 경남아파트다) */
function meaningfulWord(w: string): boolean {
  let t = w.toLowerCase();
  if (t === "아파트" || t === "단지") return false;
  t = stripAptTail(t.replace(/^([0-9]+)단지$/, "$1"));
  return t.length >= 2 && !/^[0-9]+$/.test(t);
}

/**
 * 시·도 낱말 정리 — 도는 버리고(짧은 꼴은 맨 앞일 때만), 특별시·광역시·특별자치시는 꼬리만 뗀다.
 * 바뀐 게 있으면 남은 낱말을 공백으로 이어 돌려준다(괄호 같은 구분 기호는 이때만 공백이 된다 — 키·토큰은 같다).
 * 남은 낱말이 '아파트'·'단지'·번호뿐이면 손대지 않는다("경남 아파트" → 경남아파트 그대로).
 * doContext = 도를 하나라도 버렸다(광역·특별시 구를 후보에서 뺀다).
 */
export function stripProvinceWords(text: string): { text: string; doContext: boolean } {
  const words = text.split(/[^0-9A-Za-z가-힣]+/).filter(Boolean);
  if (words.length < 2) return { text, doContext: false };
  const kept: string[] = [];
  let changed = false;
  let doContext = false;
  for (const w of words) {
    const lw = w.toLowerCase();
    const isDo =
      PROVINCE_DO_LONG.includes(lw) ||
      (lw.endsWith("도") && PROVINCE_DO_SHORT.includes(lw.slice(0, -1))) ||
      (kept.length === 0 && PROVINCE_DO_SHORT.includes(lw));
    if (isDo) {
      changed = true;
      doContext = true;
      continue;
    }
    const m = METRO_TAIL.exec(lw);
    if (m) {
      changed = true;
      kept.push(m[1]);
      continue;
    }
    kept.push(w);
  }
  if (!changed || !kept.some(meaningfulWord)) return { text, doContext: false };
  return { text: kept.join(" "), doContext };
}

/** 질의 글자 정리 — 공백 정리 · 80자 · 시·도 낱말. SQL 의 q 계산과 같은 순서다. */
export function normalizeComplexQueryText(input: string): { text: string; doContext: boolean } {
  const t = (input ?? "").replace(/\s+/g, " ").trim().slice(0, COMPLEX_QUERY_MAX);
  return stripProvinceWords(t);
}

/** 자모만 2자 이상 — 초성 검색(RPC 의 별도 갈래, 이름 규칙을 쓰지 않는다) */
export function isChosungQuery(input: string): boolean {
  const t = (input ?? "").replace(/\s+/g, " ").trim().slice(0, COMPLEX_QUERY_MAX);
  return t.length >= 2 && /^[ㄱ-ㅎㅏ-ㅣ]+$/.test(t);
}

/* ── 질의 해석 ─────────────────────────────────────────────────────────── */

export interface QueryPart {
  /** 접힌 토큰 */
  text: string;
  /** 숫자만(단지 번호) — 이름에서만, 숫자 경계로 찾는다("7"이 "17"·"747-12" 에 걸리지 않게) */
  numeric: boolean;
  /** 이름에서 찾을 표기들 */
  alts: string[];
  /** 지역·주소에서 찾을 표기들(시/군/구 꼬리 뗀 형 포함) — 숫자·한 글자 토큰은 빈 배열 */
  regionAlts: string[];
}

export interface ParsedComplexQuery {
  /** 공백을 정리한 원문 — 유사도 계산용(DB 의 similarity(complex_name, q) 와 같은 입력) */
  raw: string;
  /** 접기 전 정규화 키 */
  key0: string;
  /** 접은 정규화 키 */
  key: string;
  /** 등급 0 비교용: [key0, key, key 의 DB 표기들] */
  forms0: string[];
  /** 등급 1 비교용: forms0 ∪ ('아파트'·'N단지' 꼬리 뗀 형과 그 DB 표기들) */
  formsX: string[];
  /** 등급 3·4(앞부분·포함) 비교용: formsX 중 2자 이상(질의 자체가 1자면 1자 허용) —
   *  "7단지"의 꼬리 뗀 형 "7" 이 숫자 든 모든 이름에 걸리지 않게 */
  formsP: string[];
  /** 토큰(접기·꼬리 처리·중복 제거) */
  tokens: string[];
  /** 토큰 묶음 — 토큰 2개 이상이면 [토큰들], 한 덩어리(4자 이상)면 두 조각으로 나눈 후보들 */
  tokenSets: QueryPart[][];
  /** 도(道) 낱말을 버렸다 — 광역·특별시 구는 후보가 아니다(METRO_REGION) */
  doContext: boolean;
  /** 자모만 2자 이상(초성 검색) — 이름 규칙 대신 RPC 순서를 그대로 쓴다 */
  chosung: boolean;
}

const REGION_TAIL = /[시군구]$/;

function makePart(text: string): QueryPart {
  const numeric = /^[0-9]+$/.test(text);
  const alts = numeric ? [text] : brandVariants(text);
  /* 한 글자 토큰은 지역·주소에서 찾지 않는다 — "은 마" 의 '마' 가 창원 '마'산회원구에 걸려 순서가 흔들렸다(v3 재현) */
  const regionAlts =
    numeric || text.length < 2
      ? []
      : REGION_TAIL.test(text) && text.length >= 3
        ? [...alts, text.slice(0, -1)]
        : alts;
  return { text, numeric, alts, regionAlts };
}

/**
 * 한 덩어리 질의("동탄롯데캐슬"·"광교힐스테이트")를 두 조각으로 나눈 후보.
 * 자르는 자리: 앞 2·3자, 뒤 3·2자 — 동/지역 이름이 대개 2~3자다.
 * 긴 조각이 3자 이상이어야 한다(4자 질의만 2+2 허용) — 짧은 조각끼리는 아무 이름에나 걸린다.
 */
export function splitCompound(t: string): string[][] {
  const len = t.length;
  if (len < 4 || /^[0-9]+$/.test(t)) return [];
  const cuts = [...new Set([2, 3, len - 3, len - 2])]
    .filter((p) => p >= 2 && len - p >= 2)
    .sort((a, b) => a - b);
  const out: string[][] = [];
  for (const p of cuts) {
    const a = t.slice(0, p);
    const b = t.slice(p);
    if (Math.max(a.length, b.length) >= 3 || len === 4) out.push([a, b]);
  }
  return out;
}

/** 질의 토큰 — 숫자 앞 띄우기("목동7단지"→"목동 7단지") · 접기 · '아파트'/'단지' 토큰 버리기 · 꼬리 처리 */
export function tokenizeComplexQuery(raw: string): string[] {
  const spaced = raw.toLowerCase().replace(/([^0-9])([0-9])/g, "$1 $2");
  const out: string[] = [];
  for (const p of spaced.split(/[^0-9a-z가-힣]+/)) {
    if (!p) continue;
    let t = foldBrands(p);
    if (t === "아파트" || t === "단지") continue;
    t = t.replace(/^([0-9]+)단지$/, "$1");
    t = stripAptTail(t);
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= COMPLEX_TOKEN_MAX) break;
  }
  return out;
}

export function parseComplexQuery(input: string): ParsedComplexQuery {
  const chosung = isChosungQuery(input);
  const { text: raw, doContext } = chosung
    ? { text: (input ?? "").replace(/\s+/g, " ").trim().slice(0, COMPLEX_QUERY_MAX), doContext: false }
    : normalizeComplexQueryText(input);
  const key0 = complexNameKey(raw);
  const key = foldBrands(key0);
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const forms0 = uniq([key0, ...brandVariants(key)]);
  const na = stripAptTail(key);
  const formsX = uniq([
    ...forms0,
    ...[na, stripDanjiTail(key), stripDanjiTail(na)].flatMap((f) => brandVariants(f)),
  ]);
  const formsP = formsX.filter((f) => f.length >= Math.min(2, key.length));
  const tokens = tokenizeComplexQuery(raw);
  let tokenSets: QueryPart[][] = [];
  if (tokens.length >= 2) tokenSets = [tokens.map(makePart)];
  else if (tokens.length === 1) tokenSets = splitCompound(tokens[0]).map((ps) => ps.map(makePart));
  return { raw, key0, key, forms0, formsX, formsP, tokens, tokenSets, doContext, chosung };
}

/* ── 유사도 (pg_trgm similarity 와 같은 규칙) ─────────────────────────── */

function trigramSet(s: string): Set<string> {
  const set = new Set<string>();
  for (const w of s.toLowerCase().split(/[^0-9a-z가-힣]+/)) {
    if (!w) continue;
    const p = `  ${w} `;
    for (let i = 0; i + 3 <= p.length; i++) set.add(p.slice(i, i + 3));
  }
  return set;
}

/** pg_trgm similarity() — 낱말마다 앞 공백 2·뒤 공백 1을 붙인 3글자 조각의 자카드 비율(float4 로 맞춤) */
export function trigramSimilarity(a: string, b: string): number {
  const x = trigramSet(a);
  const y = trigramSet(b);
  if (x.size === 0 || y.size === 0) return 0;
  let common = 0;
  for (const t of x) if (y.has(t)) common++;
  return Math.fround(common / (x.size + y.size - common));
}

/** 트라이그램 유사도 하한 — pg_trgm similarity_threshold 기본값. 등급 7(비슷한 이름)의 문턱이다. */
export const SIMILARITY_FLOOR = 0.3;

/* ── 한 후보 맞춰 보기 ─────────────────────────────────────────────────── */

export interface ComplexCandidate {
  name: string;
  /** region_name ("안양 동안구") */
  region: string;
  /** 대표 지번 주소 ("안양 동안구 관양동 1588") */
  address?: string | null;
  /** 최근 6개월 매매 건수 */
  recentTradeCount?: number | null;
  /** 전체 매매 건수 */
  tradeCount?: number | null;
}

export interface ComplexMatch {
  tier: number;
  /** 가장 잘 맞은 토큰 묶음에서 이름에 든 토큰 수 */
  nameTokens: number;
  sim: number;
}

/** PG 정규식 (a|b) 의 "가장 왼쪽 · 같은 자리면 가장 긴" 일치 */
function leftmostLongest(hay: string, alts: string[]): string | null {
  let bestAt = -1;
  let best: string | null = null;
  for (const a of alts) {
    const at = hay.indexOf(a);
    if (at < 0) continue;
    if (bestAt < 0 || at < bestAt || (at === bestAt && a.length > (best ?? "").length)) {
      bestAt = at;
      best = a;
    }
  }
  return best;
}

/** 숫자 토큰 — 앞뒤가 숫자가 아닌 자리의 그 숫자 */
function numericIn(hay: string, digits: string): boolean {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(digits, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : hay[at - 1];
    const after = hay[at + digits.length] ?? "";
    if (!/[0-9]/.test(before) && !/[0-9]/.test(after)) return true;
    from = at + 1;
  }
}

type SetMatch = { tier: number; nameTokens: number };

/** 더 나은 쪽 — 등급이 낮은 것, 같으면 이름에 든 토큰이 많은 것(SQL: order by set_tier, in_name desc) */
function betterSet(a: SetMatch | null, b: SetMatch | null): SetMatch | null {
  if (!a) return b;
  if (!b) return a;
  if (a.tier !== b.tier) return a.tier < b.tier ? a : b;
  return b.nameTokens > a.nameTokens ? b : a;
}

/**
 * 토큰 묶음 하나를 한 가지로 읽는다.
 * regionFirst=false: 이름에 있으면 이름 토큰(직전 규칙) · regionFirst=true: 지역·주소에 있으면 지역 토큰.
 */
function readSet(
  parts: QueryPart[],
  nn: string,
  nameForms: string[],
  rg: string,
  regionFirst: boolean,
): SetMatch | null {
  let inName = 0;
  let inRegion = 0;
  let join = "";
  for (const p of parts) {
    const inRg = !p.numeric && p.regionAlts.some((a) => rg.includes(a));
    if (regionFirst && inRg) {
      inRegion++;
      continue;
    }
    const hit = p.numeric ? (numericIn(nn, p.text) ? p.text : null) : leftmostLongest(nn, p.alts);
    if (hit !== null) {
      inName++;
      join += hit;
      continue;
    }
    if (inRg) {
      inRegion++;
      continue;
    }
    return null;
  }
  if (inName < 1) return null;
  if (inRegion >= 1 && nameForms.includes(join)) return { tier: 2, nameTokens: inName };
  if (inRegion >= 1 && join && nn.startsWith(join)) return { tier: 5, nameTokens: inName };
  return { tier: 6, nameTokens: inName };
}

/** 두 가지로 읽어 나은 쪽(SQL: sm 의 in_name/in_region 과 in_name2/in_region2 두 벌) */
function matchSet(parts: QueryPart[], nn: string, nameForms: string[], rg: string): SetMatch | null {
  return betterSet(readSet(parts, nn, nameForms, rg, false), readSet(parts, nn, nameForms, rg, true));
}

/** 후보 하나의 등급·유사도. 등급 7 이면서 유사도 0.3 미만이면 null(버림). */
export function matchComplex(pq: ParsedComplexQuery, c: ComplexCandidate): ComplexMatch | null {
  const nn = complexNameKey(c.name);
  if (!nn) return null;
  /* 도를 버린 질의("경기 광주 …")에 광역·특별시 구 후보는 없다 */
  if (pq.doContext && METRO_REGION.test((c.region ?? "").trim())) return null;
  const nameForms = [nn, stripAptTail(nn), stripDanjiTail(nn)];
  const rg = `${c.region ?? ""} ${c.address ?? ""}`.toLowerCase();
  const sim = trigramSimilarity(c.name, pq.raw);

  let best: SetMatch | null = null;
  for (const set of pq.tokenSets) best = betterSet(best, matchSet(set, nn, nameForms, rg));
  const nameTokens = best?.nameTokens ?? 0;

  let tier: number;
  if (pq.forms0.includes(nn)) tier = 0;
  else if (nameForms.some((f) => pq.formsX.includes(f))) tier = 1;
  else if (best?.tier === 2) tier = 2;
  else if (pq.formsP.some((f) => nn.startsWith(f))) tier = 3;
  else if (pq.formsP.some((f) => nn.includes(f))) tier = 4;
  else if (best?.tier === 5) tier = 5;
  else if (best?.tier === 6) tier = 6;
  else tier = 7;

  if (tier === 7 && sim < SIMILARITY_FLOOR) return null;
  return { tier, nameTokens, sim };
}

/* ── 순위 ─────────────────────────────────────────────────────────────── */

export type RankedComplex<T> = T & { match: ComplexMatch };

/** SQL 의 ORDER BY 와 같은 비교 */
export function compareMatches(
  a: { match: ComplexMatch } & ComplexCandidate,
  b: { match: ComplexMatch } & ComplexCandidate,
): number {
  const ra = a.recentTradeCount ?? 0;
  const rb = b.recentTradeCount ?? 0;
  return (
    a.match.tier - b.match.tier ||
    b.match.nameTokens - a.match.nameTokens ||
    (a.match.tier < 7 ? rb - ra : 0) ||
    b.match.sim - a.match.sim ||
    rb - ra ||
    (b.tradeCount ?? 0) - (a.tradeCount ?? 0) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.region < b.region ? -1 : a.region > b.region ? 1 : 0)
  );
}

/** 후보들을 등급대로 줄 세운다(맞지 않는 후보는 뺀다). */
export function rankComplexes<T extends ComplexCandidate>(
  query: string | ParsedComplexQuery,
  rows: readonly T[],
): RankedComplex<T>[] {
  const pq = typeof query === "string" ? parseComplexQuery(query) : query;
  if (!pq.key) return [];
  const out: RankedComplex<T>[] = [];
  for (const r of rows) {
    const m = matchComplex(pq, r);
    if (m) out.push({ ...r, match: m });
  }
  return out.sort(compareMatches);
}
