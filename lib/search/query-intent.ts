/**
 * [1026d · 검색] 검색어 해석 — 낱말을 "조건 · 지역 · 이름" 으로 가른다(순수 함수 · 테스트 tests/unit/search-intent-1026d).
 *
 * 왜: 소유자(2026-09-30) "낱말만 쳐도 키워드·조건으로 원하는 아파트나 지역을 찾게". 배포 전 운영 실측에서
 * "마포 신축" · "대치동 대단지" · "잠실 30평대" 가 전부 "일치하는 단지가 없어요" 였다 — 검색이 단지 이름 글자만 봤다.
 *
 * 규칙(바꾸면 화면 문구 · 연관 검색 · 테스트가 같이 바뀐다):
 *   - 준공: 신축 = 올해-5년 이후 · 준신축 = 올해-10 ~ 올해-6 · 구축 = 올해-20 이전 · 재건축 = 올해-30 이전
 *           "2015년 이후" · "10년 이내" · "30년 이상" 도 알아듣는다.
 *   - 세대: 대단지 = 1,000세대 이상 · 초대단지 = 3,000세대 이상 · "500세대 이상"
 *   - 면적: 실거래 전용면적 구간(market_agg.tx_band_complex_mv) — 20평대 = 60㎡ 미만 · 30평대(국평) = 60~85㎡ ·
 *           40평대 = 85~135㎡ · 50평 이상 = 102㎡ 이상 · "84㎡" 는 그 값이 든 구간. "그 면적 거래가 있는 단지" 라는 뜻이다.
 *   - 가격: 평균 매매 실거래가(면적 조건이 있으면 그 면적의 평균) — "10억 이하 · 5억 이상 · 5~10억 · 10억대 · 9억5천"
 *   - 순서: 거래 많은 순(기본) · 신축순 · 저렴한 순 · 비싼 순 · 세대수 많은 순
 *   - 아직 걸러 낼 자료가 없는 말(역세권 · 학군 · 한강뷰 …)은 **적용하지 않고** "반영 안 함" 칩으로만 보여 준다.
 *   - 전세·월세가 섞이면 가격은 매매가로 거르지 않는다(다른 값이다).
 * 서버에서만 부른다(클라이언트는 결과의 chips 만 그린다) — 번들에 싣지 않는다.
 */

export type AreaBand = "under-60" | "60-85" | "85-102" | "102-135" | "over-135";
export type SortKey = "trades" | "new" | "price_asc" | "price_desc" | "households";

export interface IntentChip {
  /** year · households · area · price · sort */
  key: string;
  label: string;
  /** 검색어에서 이 조건을 만든 원문(칩의 ✕ 가 검색어에서 이 글자를 뺀다) */
  token: string;
}

export interface ParsedIntent {
  /** 조건·군말을 뺀 나머지 낱말(지역·이름 후보) — 원래 순서 */
  rest: string[];
  minYear?: number;
  maxYear?: number;
  minHouseholds?: number;
  areaBands?: AreaBand[];
  /** 만원 */
  minPrice?: number;
  maxPrice?: number;
  sort?: SortKey;
  chips: IntentChip[];
  /** 알아들었지만 걸러 낼 자료가 없는 말 — 적용하지 않는다 */
  unsupported: IntentChip[];
  /** 뺀 군말(시세·실거래·아파트 …) */
  noise: string[];
}

/** 한국 시각의 올해 */
export function currentYearKst(now: Date = new Date()): number {
  return new Date(now.getTime() + 9 * 3600 * 1000).getUTCFullYear();
}

const BAND_LABEL: Record<AreaBand, string> = {
  "under-60": "전용 60㎡ 미만",
  "60-85": "전용 60~85㎡",
  "85-102": "전용 85~102㎡",
  "102-135": "전용 102~135㎡",
  "over-135": "전용 135㎡ 이상",
};

/** 구간 목록 → "전용 60~85㎡" 처럼 이어 붙인 한 말 */
export function bandsLabel(bands: AreaBand[]): string {
  const order: AreaBand[] = ["under-60", "60-85", "85-102", "102-135", "over-135"];
  const s = order.filter((b) => bands.includes(b));
  if (s.length === 0) return "";
  if (s.length === 1) return BAND_LABEL[s[0]];
  const lo = { "under-60": 0, "60-85": 60, "85-102": 85, "102-135": 102, "over-135": 135 }[s[0]];
  const hiBand = s[s.length - 1];
  if (hiBand === "over-135") return lo === 0 ? "전 면적" : `전용 ${lo}㎡ 이상`;
  const hi = { "under-60": 60, "60-85": 85, "85-102": 102, "102-135": 135 }[hiBand];
  return lo === 0 ? `전용 ${hi}㎡ 미만` : `전용 ${lo}~${hi}㎡`;
}

/** 평(공급 기준 통칭) → 전용 구간. 24평형≈59㎡ · 34평형≈84㎡ · 44평형≈114㎡ */
function bandsForPyeong(p: number): AreaBand[] {
  if (p < 30) return ["under-60"];
  if (p < 40) return ["60-85"];
  if (p < 50) return ["85-102", "102-135"];
  return ["102-135", "over-135"];
}

function bandForM2(m2: number): AreaBand {
  if (m2 < 60) return "under-60";
  if (m2 < 85.5) return "60-85";
  if (m2 < 102) return "85-102";
  if (m2 < 135) return "102-135";
  return "over-135";
}

/** "10" · "9.5" · (억, 천) → 만원 */
function eokToManwon(eok: string, cheon?: string): number {
  const v = Number(eok) * 10000 + (cheon ? Number(cheon) * 1000 : 0);
  return Math.round(v);
}

function fmtEok(manwon: number): string {
  const eok = manwon / 10000;
  return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1).replace(/\.0$/, "")}억`;
}

const KOR_NUM: Record<string, number> = { 천: 1000, 이천: 2000, 삼천: 3000, 오천: 5000, 만: 10000 };

/** 걸러 낼 자료가 없는 조건어 — 적용하지 않고 알려만 준다 */
const UNSUPPORTED = [
  "초역세권",
  "역세권",
  "학군지",
  "학군",
  "초품아",
  "숲세권",
  "공세권",
  "한강뷰",
  "오션뷰",
  "급매",
  "재개발",
];
const RENT_WORDS = ["전세", "월세"];
/** 검색어에서만 빼는 군말(다른 낱말이 남을 때만) */
const NOISE = new Set([
  "아파트",
  "아파트단지",
  "단지",
  "시세",
  "실거래",
  "실거래가",
  "매매",
  "매매가",
  "가격",
  "추천",
  "정보",
  "근처",
  "주변",
  "쪽",
  "위주",
  "순",
  "찾기",
  "검색",
]);

type Rule = {
  re: RegExp;
  apply: (m: RegExpExecArray, out: ParsedIntent, y: number, ctx: { rent: boolean }) => boolean;
};

const NUM = "(\\d+(?:\\.\\d+)?)";

const RULES: Rule[] = [
  /* ── 가격 ── (전세·월세가 섞이면 매매가로 거르지 않는다 — 규칙은 소비하되 적용하지 않는다) */
  {
    // 5~10억 · 5억~10억 · 5-10억
    re: new RegExp(`${NUM}\\s*억?\\s*[~\\-]\\s*${NUM}\\s*억(?:\\s*(?:원|사이|대))?`, "g"),
    apply: (m, o, _y, ctx) => {
      const a = eokToManwon(m[1]);
      const b = eokToManwon(m[2]);
      if (!(a > 0 && b > 0)) return false;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (ctx.rent) return unsupported(o, m[0], `${fmtEok(lo)}~${fmtEok(hi)}(매매가로만 걸러요)`);
      o.minPrice = lo;
      o.maxPrice = hi;
      o.chips.push({ key: "price", label: `평균 매매 ${fmtEok(lo)}~${fmtEok(hi)}`, token: m[0] });
      return true;
    },
  },
  {
    // 10억 이하 · 9억5천 미만 · 15억 이상 · 10억대 · 10억
    re: new RegExp(
      `${NUM}\\s*억(?:\\s*(\\d)\\s*천(?:만)?)?(?:\\s*원)?(?:\\s*(이하|미만|아래|까지|안쪽|이내|이상|초과|넘는|넘게|부터|대))?`,
      "g",
    ),
    apply: (m, o, _y, ctx) => {
      const v = eokToManwon(m[1], m[2]);
      if (!(v > 0)) return false;
      const q = m[3] ?? "";
      if (ctx.rent) return unsupported(o, m[0], `${m[0].replace(/\s+/g, " ")}(매매가로만 걸러요)`);
      if (/이하|미만|아래|까지|안쪽|이내/.test(q)) {
        o.maxPrice = v;
        o.chips.push({ key: "price", label: `평균 매매 ${fmtEok(v)} 이하`, token: m[0] });
      } else if (/이상|초과|넘는|넘게|부터/.test(q)) {
        o.minPrice = v;
        o.chips.push({ key: "price", label: `평균 매매 ${fmtEok(v)} 이상`, token: m[0] });
      } else if (q === "대") {
        const eok = v / 10000;
        const span = eok >= 10 && Number.isInteger(eok) && eok % 10 === 0 ? 100000 : 10000;
        o.minPrice = v;
        o.maxPrice = v + span - 1;
        o.chips.push({ key: "price", label: `평균 매매 ${fmtEok(v)}대`, token: m[0] });
      } else {
        /* 그냥 "10억" — 그 값 안팎(±10%) */
        o.minPrice = Math.round(v * 0.9);
        o.maxPrice = Math.round(v * 1.1);
        o.chips.push({ key: "price", label: `평균 매매 ${fmtEok(o.minPrice)}~${fmtEok(o.maxPrice)}`, token: m[0] });
      }
      return true;
    },
  },
  /* ── 면적 ── */
  {
    // 84㎡ · 59m2 · 114제곱미터
    re: /(\d{2,3}(?:\.\d+)?)\s*(?:㎡|m2|m²|제곱미터|제곱)/gi,
    apply: (m, o) => {
      const v = Number(m[1]);
      if (!(v >= 10 && v <= 400)) return false;
      addBands(o, [bandForM2(v)], m[0], `${bandsLabel([bandForM2(v)])} 거래`);
      return true;
    },
  },
  {
    // 30평대 · 34평 · 25평형
    re: /(\d{1,2})\s*평\s*(?:형)?\s*(대|이상)?/g,
    apply: (m, o) => {
      const p = Number(m[1]);
      if (!(p >= 10 && p <= 99)) return false;
      const base = bandsForPyeong(p);
      const bands: AreaBand[] = m[2] === "이상" ? ALL_BANDS.filter((b) => bandRank(b) >= bandRank(base[0])) : base;
      const decade = `${Math.floor(p / 10) * 10}평${m[2] === "이상" ? " 이상" : "대"}`;
      addBands(o, bands, m[0], `${decade} · ${bandsLabel(bands)} 거래`);
      return true;
    },
  },
  {
    re: /국민\s*평형|국평/g,
    apply: (m, o) => {
      addBands(o, ["60-85"], m[0], "국민평형 · 전용 60~85㎡ 거래");
      return true;
    },
  },
  {
    re: /중소형|중대형|소형|중형|대형평수|대형/g,
    apply: (m, o) => {
      const w = m[0];
      const bands: AreaBand[] =
        w === "중소형"
          ? ["under-60", "60-85"]
          : w === "중대형"
            ? ["85-102", "102-135"]
            : w === "소형"
              ? ["under-60"]
              : w === "중형"
                ? ["60-85"]
                : ["85-102", "102-135", "over-135"];
      addBands(o, bands, w, `${w === "대형평수" ? "대형" : w} · ${bandsLabel(bands)} 거래`);
      return true;
    },
  },
  /* ── 세대 ── */
  {
    re: /(\d{1,2},\d{3}|\d{3,5}|천|이천|삼천|오천)\s*세대\s*(이상|넘는|넘게|초과)?/g,
    apply: (m, o) => {
      const raw = m[1];
      const v = KOR_NUM[raw] ?? Number(raw.replace(/,/g, ""));
      if (!(v >= 100 && v <= 20000)) return false;
      o.minHouseholds = v;
      o.chips.push({ key: "households", label: `${v.toLocaleString("ko-KR")}세대 이상`, token: m[0] });
      return true;
    },
  },
  {
    re: /초대단지|매머드\s*단지|대단지/g,
    apply: (m, o) => {
      const v = m[0] === "대단지" ? 1000 : 3000;
      o.minHouseholds = Math.max(o.minHouseholds ?? 0, v);
      o.chips.push({
        key: "households",
        label: `${m[0] === "대단지" ? "대단지" : "초대단지"} · ${v.toLocaleString("ko-KR")}세대 이상`,
        token: m[0],
      });
      return true;
    },
  },
  /* ── 준공 ── */
  {
    // 2015년 이후 · 2010년 이전 · 2018년식
    re: /((?:19|20)\d{2})\s*년\s*(?:식|준공|입주)?\s*(이후|이상|부터|후|이전|전|까지|이하)?/g,
    apply: (m, o, y) => {
      const v = Number(m[1]);
      if (!(v >= 1960 && v <= y + 3)) return false;
      const q = m[2] ?? "";
      if (/이전|전|까지|이하/.test(q)) {
        o.maxYear = v;
        o.chips.push({ key: "year", label: `${v}년 이전 준공`, token: m[0] });
      } else if (/이후|이상|부터|후/.test(q)) {
        o.minYear = v;
        o.chips.push({ key: "year", label: `${v}년 이후 준공`, token: m[0] });
      } else {
        o.minYear = v;
        o.maxYear = v;
        o.chips.push({ key: "year", label: `${v}년 준공`, token: m[0] });
      }
      return true;
    },
  },
  {
    // 10년 이내 · 5년차 이하 · 30년 이상 · 20년 넘은
    re: /(\d{1,2})\s*년\s*(?:차)?\s*(이내|미만|안|안쪽|이하|이상|넘은|넘는|초과|된)/g,
    apply: (m, o, y) => {
      const n = Number(m[1]);
      if (!(n >= 1 && n <= 60)) return false;
      if (/이내|미만|안|안쪽|이하/.test(m[2])) {
        o.minYear = y - n;
        o.chips.push({ key: "year", label: `준공 ${n}년 이내 · ${y - n}년 이후`, token: m[0] });
      } else {
        o.maxYear = y - n;
        o.chips.push({ key: "year", label: `준공 ${n}년 이상 · ${y - n}년 이전`, token: m[0] });
      }
      return true;
    },
  },
  /* ── 순서 ── */
  {
    re: /거래\s*많은\s*(?:순)?|거래순|인기\s*(?:순|많은)?|최신\s*순|신축\s*순|새\s*아파트\s*순|저렴한\s*(?:순)?|싼\s*(?:순)?|저가|가성비|비싼\s*(?:순)?|고가|세대\s*(?:수)?\s*많은\s*(?:순)?/g,
    apply: (m, o) => {
      const w = m[0].replace(/\s+/g, "");
      let sort: SortKey = "trades";
      let label = "거래 많은 순";
      if (/최신|신축순|새아파트순/.test(w)) {
        sort = "new";
        label = "신축 순";
      } else if (/비싼|고가/.test(w)) {
        /* "비싼" 에도 "싼" 이 들어 있다 — 먼저 본다 */
        sort = "price_desc";
        label = "평균 매매가 높은 순";
      } else if (/저렴|싼|저가|가성비/.test(w)) {
        sort = "price_asc";
        label = "평균 매매가 낮은 순";
      } else if (/세대/.test(w)) {
        sort = "households";
        label = "세대 많은 순";
      }
      o.sort = sort;
      o.chips.push({ key: "sort", label, token: m[0] });
      return true;
    },
  },
  {
    re: /준신축|신축급|신축|새\s*아파트|구축|재건축\s*연한|재건축/g,
    apply: (m, o, y) => {
      const w = m[0].replace(/\s+/g, "");
      if (w === "준신축") {
        o.minYear = y - 10;
        o.maxYear = y - 6;
        o.chips.push({ key: "year", label: `준신축 · ${y - 10}~${y - 6}년 준공`, token: m[0] });
      } else if (w === "신축" || w === "신축급" || w === "새아파트") {
        o.minYear = y - 5;
        o.chips.push({ key: "year", label: `신축 · ${y - 5}년 이후 준공`, token: m[0] });
      } else if (w === "구축") {
        o.maxYear = y - 20;
        o.chips.push({ key: "year", label: `구축 · ${y - 20}년 이전 준공`, token: m[0] });
      } else {
        o.maxYear = y - 30;
        o.chips.push({ key: "year", label: `재건축 연한 · ${y - 30}년 이전 준공`, token: m[0] });
      }
      return true;
    },
  },
];

const ALL_BANDS: AreaBand[] = ["under-60", "60-85", "85-102", "102-135", "over-135"];

function bandRank(b: AreaBand): number {
  return ALL_BANDS.indexOf(b);
}

function addBands(o: ParsedIntent, bands: AreaBand[], token: string, label: string) {
  o.areaBands = Array.from(new Set([...(o.areaBands ?? []), ...bands]));
  o.chips.push({ key: "area", label, token });
}

function unsupported(o: ParsedIntent, token: string, label: string): boolean {
  o.unsupported.push({ key: "unsupported", label, token });
  return true;
}

/**
 * 검색어 → 조건 + 나머지 낱말. 조건이 겹치면(신축 + 2015년 이후) 뒤의 것이 이긴다 — 칩은 둘 다 남아 지울 수 있다.
 * 조건만 있고 나머지가 없으면 rest=[] (전국 조건 검색).
 */
export function parseSearchIntent(raw: string, year: number = currentYearKst()): ParsedIntent {
  const out: ParsedIntent = { rest: [], chips: [], unsupported: [], noise: [] };
  let s = ` ${(raw ?? "").replace(/\s+/g, " ").trim()} `;
  if (s.trim().length === 0) return out;
  const ctx = { rent: RENT_WORDS.some((w) => s.includes(w)) };

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let next = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(s))) {
      if (m[0].trim() === "") {
        rule.re.lastIndex++;
        continue;
      }
      /* 낱말 가운데를 자르지 않는다 — "래미안30평대" 처럼 붙어 있어도 조건 부분만 뗀다(앞은 이름으로 남는다) */
      if (rule.apply(m, out, year, ctx)) {
        next += s.slice(last, m.index) + " ";
        last = m.index + m[0].length;
      }
    }
    s = next + s.slice(last);
  }

  for (const w of [...UNSUPPORTED, ...RENT_WORDS]) {
    if (s.includes(w)) {
      unsupported(out, w, `${w}(반영 안 함)`);
      s = s.split(w).join(" ");
    }
  }

  /* 칩은 검색어에 적힌 순서대로 */
  const src = (raw ?? "").replace(/\s+/g, " ");
  const at = (c: IntentChip) => {
    const i = src.indexOf(c.token.trim());
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  out.chips.sort((a, b) => at(a) - at(b));
  out.unsupported.sort((a, b) => at(a) - at(b));

  const toks = s
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
  const kept = toks.filter((t) => !NOISE.has(t));
  const noise = toks.filter((t) => NOISE.has(t));
  /* 군말만 남았으면(예: "아파트") 그대로 둔다 — 빈 검색이 되지 않게 */
  if (kept.length > 0 || out.chips.length > 0) {
    out.rest = kept;
    out.noise = noise;
  } else {
    out.rest = toks;
  }
  return out;
}

/** 조건을 하나라도 알아들었는가(순서만 있는 건 조건이 아니다) */
export function hasFilter(p: ParsedIntent): boolean {
  return (
    p.minYear != null ||
    p.maxYear != null ||
    p.minHouseholds != null ||
    (p.areaBands?.length ?? 0) > 0 ||
    p.minPrice != null ||
    p.maxPrice != null
  );
}

/* ── 지역 해석 ─────────────────────────────────────────────────────────── */

export type AreaKind = "sido" | "city" | "sigungu" | "dong" | "alias";

/** public.search_areas 한 행 */
export interface AreaRow {
  kind: AreaKind;
  areaKey: string;
  label: string;
  shortLabel: string;
  regions: string[];
  dong: string | null;
  complexCount: number;
  recentTradeCount: number;
  lat: number | null;
  lng: number | null;
  matchToken: string | null;
  /** 3 = 이름 그대로(마포구·잠실동) · 2 = 줄인 이름(마포·잠실) · 1 = 앞글자 일치 */
  matchRank: number;
}

export interface ResolvedScope {
  kind: AreaKind;
  label: string;
  shortLabel: string;
  regions: string[];
  dong: string | null;
  lat: number | null;
  lng: number | null;
  complexCount: number;
  recentTradeCount: number;
  /** 지역으로 쓴 낱말의 가장 낮은 확실도(3 이름 그대로 · 2 줄인 이름) */
  rank: number;
}

/** 낱말 정규화 — search_areas 와 같은 규칙(소문자 · 한글/영숫자만) */
export function normToken(t: string): string {
  return (t ?? "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

const REGION_LEVEL: Record<AreaKind, number> = { sido: 0, city: 1, alias: 1, sigungu: 2, dong: 3 };

/**
 * 나머지 낱말을 지역(시도·시·시군구 하나 + 읍면동 하나)과 이름으로 가른다.
 * 앞 낱말이 지역을 정하면 뒤 낱말은 그 안에서만 좁힌다("서울 마포구 아현동"). 안 맞으면 이름으로 남긴다.
 */
export function resolveScope(
  rest: string[],
  rows: AreaRow[],
): { scope: ResolvedScope | null; nameTokens: string[] } {
  /* 루프 안 재할당은 TS 흐름 분석이 좁혀 버린다 — 상태를 한 객체에 담는다 */
  const st: { region: AreaRow | null; dong: AreaRow | null; rank: number } = { region: null, dong: null, rank: 3 };
  const nameTokens: string[] = [];
  const within = (r: AreaRow, outer: AreaRow) => r.regions.every((x) => outer.regions.includes(x));
  for (const tok of rest) {
    const n = normToken(tok);
    const cands = rows
      .filter((r) => r.matchToken === n && r.matchRank >= 2)
      .sort(
        (a, b) =>
          b.matchRank - a.matchRank ||
          (a.kind === "dong" ? 1 : 0) - (b.kind === "dong" ? 1 : 0) ||
          b.recentTradeCount - a.recentTradeCount,
      );
    let used: AreaRow | null = null;
    if (!st.region && !st.dong) {
      const best = cands[0];
      if (best) {
        if (best.kind === "dong") st.dong = best;
        else st.region = best;
        used = best;
      }
    } else {
      const outer = st.region;
      const curDong = st.dong;
      /* 더 좁은 시군구(서울 → 마포구) */
      const narrower = outer
        ? cands.find((r) => r.kind !== "dong" && REGION_LEVEL[r.kind] > REGION_LEVEL[outer.kind] && within(r, outer))
        : undefined;
      const dongIn = !curDong ? cands.find((r) => r.kind === "dong" && (!outer || within(r, outer))) : undefined;
      /* 읍면동을 먼저 정했고 뒤에 그걸 품는 시군구가 오면 그대로(중복 표기) */
      const containing =
        curDong && !outer ? cands.find((r) => r.kind !== "dong" && within(curDong, r)) : undefined;
      if (narrower && !curDong) {
        st.region = narrower;
        used = narrower;
      } else if (dongIn) {
        st.dong = dongIn;
        used = dongIn;
      } else if (containing) {
        st.region = containing;
        used = containing;
      }
    }
    if (used) st.rank = Math.min(st.rank, used.matchRank);
    else nameTokens.push(tok);
  }
  const pick = st.dong ?? st.region;
  if (!pick) return { scope: null, nameTokens };
  return {
    scope: {
      kind: pick.kind,
      label: pick.label,
      shortLabel: pick.shortLabel,
      regions: pick.regions,
      dong: st.dong?.dong ?? null,
      lat: pick.lat,
      lng: pick.lng,
      complexCount: pick.complexCount,
      recentTradeCount: pick.recentTradeCount,
      rank: st.rank,
    },
    nameTokens,
  };
}

/** 여러 곳에 같은 이름이 있는 시군구(중구·동구·강서구 …) — 줄인 이름만으로는 어디인지 모른다 */
const AMBIGUOUS_SGG = new Set(["중구", "동구", "서구", "남구", "북구", "강서구", "고성군"]);

/** 이 지역을 다시 검색할 때 쓸 짧은 검색어("마포구" · "송파구 잠실동" · "서울 중구") */
export function scopeQuery(s: Pick<ResolvedScope, "kind" | "label" | "shortLabel" | "dong">): string {
  if (s.kind === "sido" || s.kind === "city" || s.kind === "alias") return s.shortLabel;
  const parts = s.label.split(" ");
  if (s.kind === "sigungu") return AMBIGUOUS_SGG.has(s.shortLabel) ? s.label : s.shortLabel;
  /* 읍면동: 시군구 + 읍면동 */
  const regionLabel = parts.slice(0, -1).join(" ");
  const sgg = parts.length >= 2 ? parts[parts.length - 2] : "";
  return AMBIGUOUS_SGG.has(sgg) || !sgg ? `${regionLabel} ${s.dong ?? ""}`.trim() : `${sgg} ${s.dong ?? ""}`.trim();
}

/* ── 연관 검색어 엔진 [1026e] ─────────────────────────────────────────────
   소유자(2026-10-01) "띄어쓰기를 할 때 연관검색엔진도". 지금까지 친 말로 고른 단지 묶음 안에서 다음에 붙일 낱말과
   그 단지 수(public.search_next_words — 조건 규칙은 search_complexes_filtered 와 같다). 묶음을 줄이지 못하는 낱말
   (0곳 · 전부)과 이미 건 조건 종류는 뺀다 — 없는 길이나 제자리 길을 권하지 않는다. */

export type NextKind = "cond" | "dong" | "sgg" | "brand";

export interface NextWord {
  kind: NextKind;
  /** 검색어 뒤에 붙일 말("신축" · "아현동" · "래미안") */
  word: string;
  /** 줄 오른쪽 작은 글자("조건" · "동네" · "지역" · "브랜드") */
  label: string;
  /** 붙였을 때의 단지 수 */
  count: number;
}

/** public.search_next_words 한 행 */
export interface NextWordRow {
  kind: string;
  word: string;
  cnt: number;
}

export interface RelatedQuery {
  /** 검색창에 넣을 말 */
  q: string;
  /** 칩 글자("신축") */
  label: string;
  /** 그 낱말을 붙였을 때의 단지 수(실거래 집계 기준) */
  count: number;
  /** 낱말 종류(cond · dong · sgg · brand) */
  kind?: NextKind;
}

/** 조건 낱말 — [조건 종류(칩 key), 붙일 말]. 순서 = 권하는 순서 */
const COND_WORDS: Array<[string, string, string]> = [
  ["new5", "year", "신축"],
  ["big1000", "households", "대단지"],
  ["m85", "area", "30평대"],
  ["u60", "area", "20평대"],
  ["p_u10", "price", "10억 이하"],
  ["semi10", "year", "준신축"],
  ["l135", "area", "40평대"],
  ["old30", "year", "재건축"],
  ["p_u5", "price", "5억 이하"],
  ["p_o15", "price", "15억 이상"],
];
const KIND_LABEL: Record<NextKind, string> = { cond: "조건", dong: "동네", sgg: "지역", brand: "브랜드" };

/** "서울 서초구" → "서초구"(여러 곳에 있는 이름이면 "서울 중구" 그대로) · "오산시" 그대로 */
function sggWord(regionName: string): string {
  const parts = regionName.split(" ");
  const last = parts[parts.length - 1] ?? regionName;
  return parts.length > 1 && AMBIGUOUS_SGG.has(last) ? regionName : last;
}

/** 다음 낱말 후보 — 종류별로 섞어 늘어놓는다(조건 → 동네/지역 → 조건 → 브랜드 …). 자르지 않는다(완성이 전체에서 고른다). */
export function buildNextWords(rows: readonly NextWordRow[], parsed: ParsedIntent): { total: number; words: NextWord[] } {
  const total = Number(rows.find((r) => r.kind === "total")?.cnt ?? 0);
  if (!(total > 1)) return { total: Math.max(0, total), words: [] };
  const present = new Set(parsed.chips.map((c) => c.key));
  const typed = new Set(parsed.rest.map(normToken));
  const narrows = (n: number) => n > 0 && n < total;
  const cond: NextWord[] = [];
  for (const [k, group, word] of COND_WORDS) {
    const r = rows.find((x) => x.kind === "cond" && x.word === k);
    if (!r || present.has(group) || !narrows(Number(r.cnt))) continue;
    cond.push({ kind: "cond", word, label: KIND_LABEL.cond, count: Number(r.cnt) });
  }
  const area: NextWord[] = rows
    .filter((r) => (r.kind === "dong" || r.kind === "sgg") && narrows(Number(r.cnt)))
    .map((r) => {
      const word = r.kind === "sgg" ? sggWord(r.word) : r.word;
      return { kind: r.kind as NextKind, word, label: KIND_LABEL[r.kind as NextKind], count: Number(r.cnt) };
    })
    .filter((w) => !typed.has(normToken(w.word)))
    .sort((a, b) => b.count - a.count);
  const brand: NextWord[] = rows
    .filter((r) => r.kind === "brand" && narrows(Number(r.cnt)))
    .map((r) => ({ kind: "brand" as const, word: r.word, label: KIND_LABEL.brand, count: Number(r.cnt) }))
    .filter((w) => !typed.has(normToken(w.word)))
    .sort((a, b) => b.count - a.count);
  const lists: Record<string, NextWord[]> = { c: cond, a: area, b: brand };
  const pattern = ["c", "a", "c", "b", "a", "c", "a", "b"];
  const all = cond.length + area.length + brand.length;
  const words: NextWord[] = [];
  for (let i = 0; words.length < all && i < 400; i++) {
    const w = lists[pattern[i % pattern.length]].shift();
    if (w) words.push(w);
  }
  return { total, words };
}

/** 마지막 낱말 완성 — 앞 낱말까지의 다음 낱말 중 친 글자로 시작하는 것("마포 래" → 래미안 · "마포 신" → 신축 · 신수동) */
export function completeWords(words: readonly NextWord[], prefix: string, max = 6): NextWord[] {
  const p = normToken(prefix);
  if (!p) return [];
  const hit = words.filter((w) => {
    const n = normToken(w.word);
    return n.startsWith(p) && n !== p;
  });
  /* 조건 낱말이 먼저 — "신" 은 신축이 신수동보다 흔한 뜻이다 */
  return [...hit.filter((w) => w.kind === "cond"), ...hit.filter((w) => w.kind !== "cond")].slice(0, max);
}

/** 이름으로 묶을 낱말 — 꼬리 "아파트" 는 뗀다(단지명은 대개 "아파트" 없이 적힌다: 공작아파트 → 공작) */
export function nameKeys(nameTokens: readonly string[]): string[] {
  return nameTokens
    .map((t) => normToken(t).replace(/^(.{2,})아파트$/, "$1"))
    .filter((t) => t.length > 0);
}
