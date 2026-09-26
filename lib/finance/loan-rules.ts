/**
 * [1008 · M] 집 살 때 대출 한도·취득세 규칙표 — 순수 모듈(단위검증: tests/unit/loan-rules-1008.test.ts).
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────
 * /calculator 는 "2023.3 규제 완화 기준(생애최초 80%·무주택 70%·다주택 60%, 규제지역 미반영)"으로 한도를
 * 계산했다. 2025-10-16 「10·15 주택시장 안정화 대책」 뒤로 서울 전역은 규제지역(LTV 40%)이라, 서울에서
 * 8.4억 집을 사는 무주택자에게 "최대 대출 5억 8,800만원(70%)"을 보여 주고 있었다 — 실제는 3억 3,600만원.
 * 매매 결정 단계에서 가장 먼저 보는 숫자가 틀리면 나머지 계산(필요 현금·월 상환액)도 전부 틀린다.
 *
 * ── 규칙(2026-09-21 공식 원문으로 확인한 것만) ──────────────────────────
 *  · 규제지역 = 서울 25개 구 전역 + 경기 15곳
 *      2025-10-16: 과천·광명·성남(분당·수정·중원)·수원(영통·장안·팔달)·안양 동안·용인 수지·의왕·하남 (12곳)
 *      2026-07-01: 화성 동탄구·용인 기흥구·구리시 (3곳)
 *  · LTV — 무주택·처분조건부 1주택: 규제지역 40% · 비규제 70% (10·15, 금융위)
 *          생애최초: 수도권·규제지역 70% (6·27에서 80→70, 10·15 뒤에도 70% 유지 — 금융위 FAQ) · 그 외 80%
 *          추가 구입(1주택 이상 보유, 처분 안 함): 수도권·규제지역 0% (6·27; 2026-06-30 "수도권은 규제지역
 *          여부와 무관") · 그 외 비규제 60% (2023-03-02 금융위 "비규제지역 LTV 60%(종전과 동일)")
 *  · 금액 한도(수도권·규제지역 주택구입목적 주담대, 생애최초 포함): 시가 15억 이하 6억 · 15억 초과~25억 이하 4억 ·
 *    25억 초과 2억 (10·15). 그 외 지역은 금액 상한 없이 LTV·DSR — 생애최초의 금액 상한은 확인 못 해 "은행 확인".
 *  · 수도권·규제지역: 주담대로 구입 시 6개월 이내 전입, 만기 30년 이내, 처분조건부는 6개월 이내 처분 (6·27)
 *  · 스트레스 금리 하한 1.5% → 3% (수도권·규제지역 주담대, 10·15) — DSR 계산용이라 한도 식에는 넣지 않고 안내만.
 *  · 취득세 — 지방세법 제11조(1~3%, 6~9억 구간 식)·지방교육세 근사 ×1.1, 다주택 중과(제13조의2):
 *    조정대상지역 2주택 8%·3주택 이상 12%, 비조정 3주택 8%·4주택 이상 12% (정책브리핑 2025-04-22).
 *    생애최초 감면(지방세특례제한법 제36조의3): 12억 이하, 200만원 한도 — 2026년에도 연장(정책브리핑 2026-01-02,
 *    인구감소지역은 300만원).
 *  일반 정보이며 금융·세무 자문이 아니다. 실제 한도는 DSR·소득·은행 심사로 더 낮을 수 있다.
 */

/* ── 보유 주택 구분 ─────────────────────────────────────────────────────── */
export const OWNERSHIPS = ["생애최초", "무주택", "1주택 처분조건", "다주택"] as const;
export type Ownership = (typeof OWNERSHIPS)[number];

export function isOwnership(v: unknown): v is Ownership {
  return typeof v === "string" && (OWNERSHIPS as readonly string[]).includes(v);
}

/** 화면에 붙이는 한 줄 설명 — "다주택"은 **이미 집이 있고 처분하지 않고 한 채 더** 사는 경우다. */
export const OWNERSHIP_HINTS: Record<Ownership, string> = {
  생애최초: "집을 한 번도 가져 본 적 없음(세부 요건은 은행 확인)",
  무주택: "지금 집이 없음(예전에 가진 적은 있음)",
  "1주택 처분조건": "지금 1채 — 기존 집을 기한 안에 팔기로 약속",
  다주택: "집이 있고 팔지 않고 한 채 더(취득세는 2주택 기준)",
};

/* ── 지역 ─────────────────────────────────────────────────────────────── */
export type LoanRegion = "regulated" | "capital" | "other";
/** hint 는 두 줄(줄바꿈 \n) — 390px 화면의 세 칸 단추에서 한 줄이면 제멋대로 접힌다. */
export const LOAN_REGIONS: readonly { key: LoanRegion; label: string; hint: string }[] = [
  { key: "regulated", label: "규제지역", hint: "서울 전역\n경기 15곳" },
  { key: "capital", label: "수도권 비규제", hint: "인천\n경기 나머지" },
  { key: "other", label: "그 외 지역", hint: "수도권 밖\n(비규제)" },
];

export function isLoanRegion(v: unknown): v is LoanRegion {
  return v === "regulated" || v === "capital" || v === "other";
}

/** 수도권·규제지역인가 — 6·27·10·15 대책의 적용 범위("수도권·규제지역"). 규제지역은 모두 수도권이다. */
export function isCapitalOrRegulated(region: LoanRegion): boolean {
  return region === "regulated" || region === "capital";
}

/** 규제지역(투기과열지구·조정대상지역) 명단 — 지정일별. 지정·해제는 바뀔 수 있어 화면에 "국토부 공고 확인"을 붙인다. */
export const REGULATED_AREAS: readonly { since: string; names: readonly string[] }[] = [
  { since: "2025-10-16", names: ["서울 25개 구 전역"] },
  {
    since: "2025-10-16",
    names: [
      "경기 과천시",
      "광명시",
      "성남시 분당구·수정구·중원구",
      "수원시 영통구·장안구·팔달구",
      "안양시 동안구",
      "용인시 수지구",
      "의왕시",
      "하남시",
    ],
  },
  { since: "2026-07-01", names: ["경기 화성시 동탄구", "용인시 기흥구", "구리시"] },
];

/* 이름으로 지역 가르기 — 단지 화면 → 계산기 링크(`/calculator?price=…&region=`)용.
   입력은 실거래 region_name(lawd_region_map) 표기다: "서울 강남구" · "수원 영통구" · "인천 검단구" · "광주시"(경기) ·
   "광주 북구"(광주광역시) · "창원 성산구" · "사천시" · "세종시" · "고성군". 카탈로그식 "안양시 동안구"·"경기도 성남시 수정구"도 받는다.
   [1008 · M · 리뷰 B] 예전 판정은 운영 region_name 254개 중 136개를 null 로 돌려, 계산기가 기본값(규제지역)으로
   창원 5억 무주택 최대 대출을 2억(40%)으로 보여 줬다(실제 3.5억, 70%). 이제 서울·인천·경기 31개 시·군 밖은 전부
   "그 외 지역"이다. 모르는 것은 계속 null — 빈 문자열, 시·도 없이 구만("중구"), "광주"만, 규제가 구 단위로 갈리는
   시를 구 없이 적은 것("수원시"·"용인시"·"안양시"·"화성시"). 틀린 지역으로 한도를 보여 주느니 사용자가 고르게 둔다. */

/** 경기 31개 시·군(28시 + 연천·가평·양평군). "광주"는 경기 광주시 — 광주광역시는 "광주 ○구"로 적힌다. */
const GYEONGGI_CITIES: ReadonlySet<string> = new Set([
  "수원", "성남", "의정부", "안양", "부천", "광명", "평택", "동두천", "안산", "고양", "과천", "구리",
  "남양주", "오산", "시흥", "군포", "의왕", "하남", "용인", "파주", "이천", "안성", "김포", "화성",
  "광주", "양주", "포천", "여주", "연천", "가평", "양평",
]);

/** 경기 안 규제지역 — true 면 시 전체, 배열이면 그 구만(REGULATED_AREAS 와 같은 명단). */
const GYEONGGI_REGULATED: Readonly<Record<string, true | readonly string[]>> = {
  과천: true,
  광명: true,
  의왕: true,
  하남: true,
  구리: true,
  성남: true, // 수정·중원·분당 3개 구 전부
  수원: ["영통구", "장안구", "팔달구"],
  안양: ["동안구"],
  용인: ["수지구", "기흥구"],
  화성: ["동탄구"],
};

/** 서울·인천·경기 밖 시·도 표기(약칭·정식 이름) — 이 머리로 시작하면 "그 외 지역". */
const OTHER_PROVINCE_RE =
  /^(?:(?:부산|대구|대전|울산)(?:광역시)?|세종(?:특별자치시|시)?|강원(?:도|특별자치도)?|충북|충남|전북|전남|경북|경남|(?:충청|전라|경상)[남북]도|전북특별자치도|제주(?:특별자치도|도|시)?)$/;

function cityKey(token: string): string {
  return token.replace(/(?:특례시|시|군)$/, "");
}

function gyeonggiRegion(city: string, district: string | undefined): LoanRegion | null {
  const rule = GYEONGGI_REGULATED[city];
  if (rule === true) return "regulated";
  if (rule) {
    if (!district) return null; // 구 단위로 갈리는 시 — 구를 모르면 추측하지 않는다
    return rule.includes(district) ? "regulated" : "capital";
  }
  return "capital";
}

export function loanRegionFromRegionName(name: string | null | undefined): LoanRegion | null {
  const raw = (name ?? "").trim();
  if (!raw) return null;
  let tokens = raw.split(/\s+/);
  if (tokens.length === 1) {
    /* 띄어쓰기 없이 붙은 "안양시동안구" 도 시·구로 나눈다 */
    const m = /^(\S+?시)(\S+[구군])$/.exec(tokens[0]);
    if (m) tokens = [m[1], m[2]];
  }
  const [head, ...rest] = tokens;
  if (/^서울(?:특별시)?$/.test(head)) return "regulated";
  if (/^인천(?:광역시)?$/.test(head)) return "capital";
  if (/^경기(?:도)?$/.test(head)) {
    if (rest.length === 0) return null;
    return gyeonggiRegion(cityKey(rest[0]), rest[1]);
  }
  if (head === "광주광역시") return "other";
  if (head === "광주") return rest.length > 0 ? "other" : null; // "광주 북구" = 광주광역시, "광주"만은 모른다
  if (OTHER_PROVINCE_RE.test(head)) return "other";
  const city = cityKey(head);
  if (GYEONGGI_CITIES.has(city)) return gyeonggiRegion(city, rest[0]);
  if (/구$/.test(head) && rest.length === 0) return null; // "중구" — 어느 시의 구인지 모른다
  if (/(?:시|군)$/.test(head) || (rest.length > 0 && /(?:구|군|시)$/.test(rest[0]))) return "other";
  return null;
}

/* ── LTV · 금액 한도 ───────────────────────────────────────────────────── */
/** 주택구입목적 주담대 LTV 상한(%) — 지역 × 보유 주택 구분. */
export const LTV_TABLE: Readonly<Record<LoanRegion, Readonly<Record<Ownership, number>>>> = {
  regulated: { 생애최초: 70, 무주택: 40, "1주택 처분조건": 40, 다주택: 0 },
  capital: { 생애최초: 70, 무주택: 70, "1주택 처분조건": 70, 다주택: 0 },
  other: { 생애최초: 80, 무주택: 70, "1주택 처분조건": 70, 다주택: 60 },
};

/** 10·15 이전(화면이 쓰던) 규칙 — 전후 비교·회귀 설명용. 계산에는 쓰지 않는다. */
export const LEGACY_LTV_2023: Readonly<Record<Ownership, number>> = {
  생애최초: 80,
  무주택: 70,
  "1주택 처분조건": 70,
  다주택: 60,
};

export function ltvOf(region: LoanRegion, ownership: Ownership): number {
  return LTV_TABLE[region][ownership];
}

/** 수도권·규제지역 주택가격(시가) 구간별 주담대 금액 한도(만원). 경계는 "이하". */
export const PRICE_TIER_CAPS: readonly { upToManwon: number; capManwon: number; label: string }[] = [
  { upToManwon: 150_000, capManwon: 60_000, label: "15억 이하 → 6억" },
  { upToManwon: 250_000, capManwon: 40_000, label: "15억 초과~25억 이하 → 4억" },
  { upToManwon: Number.POSITIVE_INFINITY, capManwon: 20_000, label: "25억 초과 → 2억" },
];

/** 가격 구간 금액 한도(만원). 그 외 지역은 규제상 금액 상한이 없어 null. */
export function priceTierCapManwon(region: LoanRegion, priceManwon: number): number | null {
  if (!isCapitalOrRegulated(region)) return null;
  for (const t of PRICE_TIER_CAPS) {
    if (priceManwon <= t.upToManwon) return t.capManwon;
  }
  return PRICE_TIER_CAPS[PRICE_TIER_CAPS.length - 1].capManwon;
}

export type LoanLimit = {
  ltvPct: number;
  /** LTV × 매매가(만원) */
  ltvAmountManwon: number;
  /** 가격 구간 한도(만원) — 없으면 null */
  capManwon: number | null;
  /** 최대 대출 = min(LTV × 매매가, 가격 구간 한도) (만원) */
  maxLoanManwon: number;
  /** 무엇이 최대 대출을 정했나 — "none" 은 LTV 0%(대출 불가) */
  binding: "ltv" | "cap" | "none";
};

export function computeLoanLimit(input: {
  priceManwon: number;
  region: LoanRegion;
  ownership: Ownership;
}): LoanLimit {
  const price = Number.isFinite(input.priceManwon) ? Math.max(0, input.priceManwon) : 0;
  const ltvPct = ltvOf(input.region, input.ownership);
  const ltvAmountManwon = Math.floor((price * ltvPct) / 100);
  const capManwon = priceTierCapManwon(input.region, price);
  if (ltvPct <= 0 || price <= 0) {
    return { ltvPct, ltvAmountManwon: 0, capManwon, maxLoanManwon: 0, binding: "none" };
  }
  if (capManwon !== null && capManwon < ltvAmountManwon) {
    return { ltvPct, ltvAmountManwon, capManwon, maxLoanManwon: capManwon, binding: "cap" };
  }
  return { ltvPct, ltvAmountManwon, capManwon, maxLoanManwon: ltvAmountManwon, binding: "ltv" };
}

/** 주담대 만기 상한(년) — 수도권·규제지역 30년(6·27). 그 외 지역은 규제상 상한을 확인하지 못해 null(은행 확인). */
export function maxTermYears(region: LoanRegion): number | null {
  return isCapitalOrRegulated(region) ? 30 : null;
}

/** 수도권·규제지역에서 주담대로 집을 사면 6개월 이내 전입 의무(6·27). */
export function moveInDeadlineMonths(region: LoanRegion): number | null {
  return isCapitalOrRegulated(region) ? 6 : null;
}

/** 스트레스 금리 하한(%p) — DSR 산정 때 대출금리에 더한다. 수도권·규제지역 주담대 3%(10·15), 그 외는 은행 확인. */
export function stressRateFloorPct(region: LoanRegion): number | null {
  return isCapitalOrRegulated(region) ? 3 : null;
}

/* ── 기준일 · 출처 ─────────────────────────────────────────────────────── */
export const LOAN_RULES_BASIS_LABEL = "10·15 대책 기준 · 2026.09 확인";
export const LOAN_RULES_CHECKED_AT = "2026-09-21";

export type RuleSource = { label: string; href: string };
export const LOAN_RULE_SOURCES: readonly RuleSource[] = [
  {
    label: "정책브리핑 · 10·15 대책 주담대 한도(2025.10.16 시행)",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148950959",
  },
  {
    label: "금융위원회 · 6·27 가계부채 관리 강화 방안(2025.6.28 시행)",
    href: "https://www.fsc.go.kr/no010101/84824",
  },
  {
    label: "금융위원회 · 10·15 대책 FAQ(생애최초 LTV 70% 유지)",
    href: "https://www.fsc.go.kr/po020201/85466",
  },
  {
    label: "정책브리핑 · 서울 전역·경기 12곳 규제지역 지정",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148950973",
  },
  {
    label: "정책브리핑 · 동탄·기흥·구리 규제지역 지정(2026.7.1)",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148967354",
  },
  {
    label: "금융위원회 · 규제지역 추가 지정 관련 점검회의(2026.6.30)",
    href: "https://www.fsc.go.kr/no010101/87222",
  },
];

export const ACQ_TAX_SOURCES: readonly RuleSource[] = [
  {
    label: "정책브리핑 · 다주택 취득세 중과세율(2025.4.22)",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148942191",
  },
  {
    label: "정책브리핑 · 생애최초 취득세 감면 연장(2026.1.2)",
    href: "https://www.korea.kr/news/policyNewsView.do?newsId=148957418",
  },
];

/* ── 취득세(주택 유상취득) ─────────────────────────────────────────────────
   calculator-client 에서 옮겨 왔다(동작 동일 — region 을 안 주면 예전 값 그대로).
   · 1주택 계열(생애최초·무주택·1주택 처분조건): 6억 이하 1.1% / 6~9억 (매매가(억)×2/3−3)%×1.1 / 9억 초과 3.3%
     (본세 + 지방교육세 근사, 전용 85㎡ 초과 농어촌특별세 0.2%는 미반영)
   · 다주택: 조정대상지역 2주택 8% + 지방교육세 근사 = 8.4% (3주택 이상 12%는 미반영).
     [1008] region 을 주면 비조정(수도권 비규제·그 외 지역) 2주택은 일반세율 — 중과는 비조정 3주택부터다.
   · 생애최초: 12억 이하 취득 시 최대 200만원 감면(지방세특례제한법 제36조의3). */
function heavyAcquisitionTax(o: Ownership, region?: LoanRegion): boolean {
  if (o !== "다주택") return false;
  return region === undefined || region === "regulated";
}

/** 취득세 추정(만원). priceManwon: 매매가(만원). */
export function acquisitionTaxOf(priceManwon: number, o: Ownership, region?: LoanRegion): number {
  let ratePct: number;
  if (heavyAcquisitionTax(o, region)) {
    ratePct = 8.4;
  } else if (priceManwon <= 60000) {
    ratePct = 1.1;
  } else if (priceManwon >= 90000) {
    ratePct = 3.3;
  } else {
    // 6~9억 구간: 본세 (매매가(억)×2/3−3)% × 1.1(지방교육세 근사)
    ratePct = ((priceManwon / 10000) * (2 / 3) - 3) * 1.1;
  }
  let tax = priceManwon * (ratePct / 100);
  if (o === "생애최초" && priceManwon <= 120000) {
    tax = Math.max(0, tax - 200); // 생애최초 감면 최대 200만원
  }
  return tax;
}

/** 표기용 취득세율 라벨 */
export function acquisitionRateLabel(priceManwon: number, o: Ownership, region?: LoanRegion): string {
  if (heavyAcquisitionTax(o, region)) return "약 8.4%";
  if (priceManwon <= 60000) return "약 1.1%";
  if (priceManwon >= 90000) return "약 3.3%";
  return "약 1.1~3.3% 구간";
}
