/* [1024] 연립다세대 전월세(RTMSDataSvcRHRent) 매핑 추가 · 페이징(maxPages) — 이력 백필·비아파트 수집용 */
import { encodingKeyForUrl } from "@/lib/public-data/data-go-kr-keys";
import { resolveSigunguCd } from "@/lib/national-data/region-codes";

/**
 * 지역명 → 5자리 LAWD_CD (MOLIT API 파라미터).
 * 전국 시군구를 지원하며 region-codes.ts 의 테이블을 사용한다.
 */
export function resolveLawdCode(district?: string): string {
  return resolveSigunguCd(district);
}

function molitKey(): string | null {
  return encodingKeyForUrl();
}
function defaultDealYmd(yyyymm?: string): string {
  if (yyyymm?.trim()) return yyyymm.trim();
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMolitXmlItems(text: string): Record<string, unknown>[] {
  return [...text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    const row: Record<string, unknown> = {};
    for (const tag of block.matchAll(/<([^/>]+)>([^<]*)<\//g)) {
      row[tag[1]] = tag[2];
    }
    return row;
  });
}

/**
 * 실데이터를 못 받은 **이유**. `mode: "mock"` 하나로는 세 상태가 구분되지 않았다.
 *
 * 키가 없어서 못 부른 것과, 불렀는데 상대 서버가 죽어서 실패한 것과, 정상
 * 응답인데 그 달 그 지역에 거래가 없던 것은 사용자에게 해 줄 말이 전부 다르다.
 * 앞의 둘을 뭉개면 장애가 "키를 설정하세요"로 안내되고(설정해도 안 고쳐진다),
 * 뒤의 둘을 뭉개면 장애가 "거래 없음"이라는 사실로 둔갑한다.
 */
export type MolitUnavailableReason =
  /** 인코딩 키가 없다 — 소유자가 넣으면 해결된다 */
  | "not-configured"
  /** 불렀는데 실패했다(네트워크·5xx·파싱). 일시적일 수 있다 */
  | "fetch-failed"
  /** 정상 응답인데 항목이 0건이었다 — 이건 진짜 "없음"이다 */
  | "empty";

/** [1024] 응답 봉투의 totalCount — 없으면 null(페이징 판단 불가 → 1페이지만) */
export function parseMolitTotalCount(text: string): number | null {
  const m = /<totalCount>\s*(\d+)\s*<\/totalCount>/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

async function fetchMolitRtms(
  path: string,
  params: { district?: string; lawdCd?: string; yyyymm?: string; numOfRows?: number; pageNo?: number },
): Promise<{
  rows: Record<string, unknown>[];
  mode: "live" | "mock";
  reason?: MolitUnavailableReason;
  /** [1024] 서버가 알려 준 전체 건수(페이징용). 못 읽으면 null */
  totalCount: number | null;
}> {
  const key = molitKey();
  if (!key) return { rows: [], mode: "mock", reason: "not-configured", totalCount: null };

  // lawdCd 가 명시되면 그대로 사용. district 이름 매칭은 동명이구(부산 동구/대전 동구,
  // 서울 중구/대구 중구 등)에서 첫 번째 매칭으로 오해석돼 다른 도시 데이터를
  // 가져오는 사고가 있었다 — 코드가 있으면 이름 해석을 건너뛴다.
  const lawd = params.lawdCd?.trim() || resolveLawdCode(params.district);
  const dealYmd = defaultDealYmd(params.yyyymm);

  const url = new URL(`https://apis.data.go.kr/1613000/${path}`);
  url.searchParams.set("serviceKey", key);
  url.searchParams.set("LAWD_CD", lawd);
  url.searchParams.set("DEAL_YMD", dealYmd);
  url.searchParams.set("pageNo", String(Math.max(1, Math.floor(params.pageNo ?? 1))));
  url.searchParams.set("numOfRows", String(params.numOfRows ?? 30));

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return { rows: [], mode: "mock", reason: "fetch-failed", totalCount: null };
    const text = await res.text();
    const items = parseMolitXmlItems(text);
    const totalCount = parseMolitTotalCount(text);
    if (items.length > 0) return { rows: items, mode: "live", totalCount };
    /* 200 인데 item 이 하나도 없다 — 그 달 그 지역에 신고된 거래가 없거나,
       응답이 오류 XML 이다. 후자를 구분해 둔다: 국토부는 실패도 200 으로
       돌려주면서 resultCode 를 00 이 아닌 값으로 준다. */
    const okCode = /<resultCode>\s*0*0\s*<\/resultCode>/.test(text);
    return { rows: [], mode: "mock", reason: okCode ? "empty" : "fetch-failed", totalCount };
  } catch {
    return { rows: [], mode: "mock", reason: "fetch-failed", totalCount: null };
  }
}

export async function fetchMolitAptTrade(params: {
  district?: string;
  yyyymm?: string;
}): Promise<{
  rows: Record<string, unknown>[];
  mode: "live" | "mock";
  reason?: MolitUnavailableReason;
}> {
  return fetchMolitRtms("RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade", params);
}

export async function fetchMolitAptRent(params: {
  district?: string;
  yyyymm?: string;
}): Promise<{
  rows: Record<string, unknown>[];
  mode: "live" | "mock";
  reason?: MolitUnavailableReason;
}> {
  return fetchMolitRtms("RTMSDataSvcAptRent/getRTMSDataSvcAptRent", params);
}

// ── 전체 부동산 유형 실거래가 (apis.data.go.kr/1613000/RTMSDataSvc*) ──────────
// 단일 일반 인증키(MOLIT_SERVICE_KEY)로 11종 매매·전월세 실거래가를 조회한다.

export type MolitRtmsType =
  | "apt-sale"
  | "apt-sale-detail"
  | "apt-rent"
  | "offi-sale"
  | "offi-rent"
  | "rh-sale" // 연립다세대 매매
  | "rh-rent" // [1024] 연립다세대 전월세
  | "sh-sale" // 단독/다가구 매매
  | "sh-rent" // 단독/다가구 전월세
  | "land-sale" // 토지 매매
  | "silv-sale" // 아파트 분양권전매
  | "nrg-sale"; // 상업업무용 매매

interface RtmsTypeConfig {
  service: string;
  kind: "trade" | "rent";
  /** 단지/건물명 필드 (없으면 유형/지목/용도) */
  nameField: string;
  /** 면적 필드 (전용/연면적/대지/거래면적) */
  areaField: string;
}

const RTMS_TYPES: Record<MolitRtmsType, RtmsTypeConfig> = {
  "apt-sale": { service: "RTMSDataSvcAptTrade", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "apt-sale-detail": { service: "RTMSDataSvcAptTradeDev", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "apt-rent": { service: "RTMSDataSvcAptRent", kind: "rent", nameField: "aptNm", areaField: "excluUseAr" },
  "offi-sale": { service: "RTMSDataSvcOffiTrade", kind: "trade", nameField: "offiNm", areaField: "excluUseAr" },
  "offi-rent": { service: "RTMSDataSvcOffiRent", kind: "rent", nameField: "offiNm", areaField: "excluUseAr" },
  "rh-sale": { service: "RTMSDataSvcRHTrade", kind: "trade", nameField: "mhouseNm", areaField: "excluUseAr" },
  /* [1024] 연립다세대 전월세 — 매매(RHTrade)와 같은 건물명·전용면적 필드. 서비스명은 data.go.kr 의
     "국토교통부_연립다세대 전월세 실거래가 자료" 표준 표기(RTMSDataSvcRHRent/getRTMSDataSvcRHRent). */
  "rh-rent": { service: "RTMSDataSvcRHRent", kind: "rent", nameField: "mhouseNm", areaField: "excluUseAr" },
  "sh-sale": { service: "RTMSDataSvcSHTrade", kind: "trade", nameField: "houseType", areaField: "totalFloorAr" },
  "sh-rent": { service: "RTMSDataSvcSHRent", kind: "rent", nameField: "houseType", areaField: "totalFloorAr" },
  "land-sale": { service: "RTMSDataSvcLandTrade", kind: "trade", nameField: "jimok", areaField: "dealArea" },
  "silv-sale": { service: "RTMSDataSvcSilvTrade", kind: "trade", nameField: "aptNm", areaField: "excluUseAr" },
  "nrg-sale": { service: "RTMSDataSvcNrgTrade", kind: "trade", nameField: "buildingUse", areaField: "buildingAr" },
};

export interface MolitDeal {
  name?: string;
  umd?: string;
  /** 매매가(만원) */
  dealManwon?: number;
  /** 전월세 보증금(만원) */
  depositManwon?: number;
  /** 월세(만원) */
  monthlyManwon?: number;
  areaM2?: number;
  floor?: number;
  buildYear?: number;
  /** YYYY-MM-DD */
  dealDate: string;
  raw: Record<string, string>;
}

/** "85,000" → 85000 (만원, 콤마 제거) */
function parseManwon(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

function toDealDate(r: Record<string, unknown>): string {
  const y = String(r.dealYear ?? "").trim();
  const m = String(r.dealMonth ?? "").trim().padStart(2, "0");
  const d = String(r.dealDay ?? "").trim().padStart(2, "0");
  if (y && m && d && m !== "00") return `${y}-${m}-${d}`;
  return "";
}

function normalizeDeal(cfg: RtmsTypeConfig, r: Record<string, unknown>): MolitDeal {
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) raw[k] = String(v ?? "");
  const areaNum = Number(String(r[cfg.areaField] ?? "").replace(/,/g, ""));
  return {
    name: r[cfg.nameField] != null ? String(r[cfg.nameField]).trim() || undefined : undefined,
    umd: r.umdNm != null ? String(r.umdNm).trim() || undefined : undefined,
    dealManwon: cfg.kind === "trade" ? parseManwon(r.dealAmount) : undefined,
    depositManwon: cfg.kind === "rent" ? parseManwon(r.deposit) : undefined,
    monthlyManwon: cfg.kind === "rent" ? parseManwon(r.monthlyRent) : undefined,
    areaM2: Number.isFinite(areaNum) && areaNum > 0 ? areaNum : undefined,
    floor: r.floor != null && String(r.floor).trim() ? Number(r.floor) : undefined,
    buildYear: r.buildYear != null && String(r.buildYear).trim() ? Number(r.buildYear) : undefined,
    dealDate: toDealDate(r),
    raw,
  };
}

/** 유형별 실거래가 조회 → 정규화된 거래 목록. */
export async function fetchMolitDeals(
  type: MolitRtmsType,
  params: {
    district?: string;
    lawdCd?: string;
    yyyymm?: string;
    numOfRows?: number;
    /**
     * [1024] 최대 페이지 수(기본 1 = 예전과 같은 동작). 대형 구의 전월세는 한 달에 1,000건을
     * 넘는 달이 있어(numOfRows 상한) 1페이지만 받으면 뒤가 잘린다. totalCount 가 numOfRows×페이지를
     * 넘는 동안만 다음 페이지를 부른다 — 서버가 totalCount 를 안 주면 1페이지로 끝낸다.
     */
    maxPages?: number;
  },
): Promise<{ deals: MolitDeal[]; mode: "live" | "mock"; reason?: MolitUnavailableReason }> {
  const cfg = RTMS_TYPES[type];
  const path = `${cfg.service}/get${cfg.service}`;
  const maxPages = Math.max(1, Math.min(10, Math.floor(params.maxPages ?? 1)));
  const perPage = params.numOfRows ?? 30;
  const first = await fetchMolitRtms(path, { ...params, pageNo: 1 });
  const rows = [...first.rows];
  if (first.mode === "live" && maxPages > 1 && first.totalCount != null) {
    const pages = Math.min(maxPages, Math.ceil(first.totalCount / Math.max(1, perPage)));
    for (let pageNo = 2; pageNo <= pages; pageNo++) {
      const next = await fetchMolitRtms(path, { ...params, pageNo });
      if (next.mode !== "live") break;
      rows.push(...next.rows);
    }
  }
  return { deals: rows.map((r) => normalizeDeal(cfg, r)), mode: first.mode, reason: first.reason };
}

/** 거래 목록 요약(건수·평균 매매가/㎡·평균 보증금). */
export function summarizeDeals(deals: MolitDeal[]): {
  count: number;
  avgDealManwon?: number;
  avgPerM2Won?: number;
  avgDepositManwon?: number;
} {
  if (deals.length === 0) return { count: 0 };
  const trades = deals.filter((d) => typeof d.dealManwon === "number");
  const perM2: number[] = [];
  let dealSum = 0;
  for (const d of trades) {
    dealSum += d.dealManwon as number;
    if (d.areaM2 && d.areaM2 > 0) perM2.push(((d.dealManwon as number) * 10000) / d.areaM2);
  }
  const rents = deals.filter((d) => typeof d.depositManwon === "number");
  const depSum = rents.reduce((a, d) => a + (d.depositManwon as number), 0);
  return {
    count: deals.length,
    avgDealManwon: trades.length ? Math.round(dealSum / trades.length) : undefined,
    avgPerM2Won: perM2.length ? Math.round(perM2.reduce((a, b) => a + b, 0) / perM2.length) : undefined,
    avgDepositManwon: rents.length ? Math.round(depSum / rents.length) : undefined,
  };
}
