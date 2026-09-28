/**
 * [1024] 원룸·오피스텔 동네 실거래 전월세 — 순수 계산(server-only 밖). 조회는 rent-nonapt.ts.
 *
 * 유형 = market_transactions.property_type ∈ officetel·rowhouse·house(molit-core.NONAPT_PROPERTY_TYPES).
 * 면적대 = ~30㎡(원룸형) · 30~60(투룸형) · 60~ . 동 = address("시군구 법정동 지번")에서 뽑는다 — 실거래 표에는
 * 동 컬럼이 없다(toRow 가 `${sigungu} ${umd} ${jibun}` 으로 붙인다).
 */
import { NONAPT_PROPERTY_TYPES, type NonAptPropertyType } from "@/lib/market/molit-core";

export { NONAPT_PROPERTY_TYPES };
export type { NonAptPropertyType };

export const NONAPT_TYPE_LABEL: Record<NonAptPropertyType, string> = {
  officetel: "오피스텔",
  rowhouse: "연립다세대",
  house: "단독다가구",
};

export type AreaBandKey = "s" | "m" | "l";
export const AREA_BANDS: { key: AreaBandKey; label: string; minM2: number; maxM2: number | null }[] = [
  { key: "s", label: "~30㎡ 원룸형", minM2: 0, maxM2: 30 },
  { key: "m", label: "30~60㎡ 투룸형", minM2: 30, maxM2: 60 },
  { key: "l", label: "60㎡~", minM2: 60, maxM2: null },
];

/** 면적 → 밴드(경계는 위 밴드에 — 30.0 은 "30~60") */
export function areaBandKeyOf(areaM2: number | null): AreaBandKey | null {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  if (areaM2 < 30) return "s";
  if (areaM2 < 60) return "m";
  return "l";
}

export function isAreaBandKey(v: unknown): v is AreaBandKey {
  return v === "s" || v === "m" || v === "l";
}

/**
 * 주소에서 법정동(읍·면·리·가 포함). 시군구 토큰("수원시 영통구" 처럼 두 토큰일 수 있다)을 지나 처음 만나는
 * 동/읍/면/가/리 토큰. 못 찾으면 null. 예) "안양시 동안구 관양동 1602" → "관양동", "종로구 종로1가 45" → "종로1가".
 */
export function dongOfAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const tokens = address.trim().split(/\s+/);
  for (const t of tokens) {
    if (/(시|구|군)$/.test(t) && !/(동|읍|면|가|리)$/.test(t)) continue;
    if (/(동|읍|면|가|리)$/.test(t) && !/^\d/.test(t)) return t;
  }
  return null;
}

export interface NonAptRentDeal {
  /** YYYYMM */
  ym: string;
  day: number | null;
  type: NonAptPropertyType;
  dong: string | null;
  areaM2: number | null;
  floor: number | null;
  depositKrw: number;
  /** 0 = 전세 */
  monthlyKrw: number;
  /** 건물명 — 오피스텔·연립만 의미 있음(단독다가구는 유형명이 들어온다 → null 처리) */
  buildingName: string | null;
  buildYear: number | null;
}

export interface NonAptRentStats {
  count: number;
  medianDepositKrw: number | null;
  /** 월세만(전세 섹션에서는 null) */
  medianMonthlyKrw: number | null;
}

export interface NonAptRentSummary {
  /** 적용된 필터 */
  filter: { dong: string | null; areaBand: AreaBandKey | null };
  wolse: NonAptRentStats & { deals: NonAptRentDeal[] };
  jeonse: NonAptRentStats & { deals: NonAptRentDeal[] };
  /** 이 지역·유형(필터 전) 표본에서 본 동 목록(건수 내림차순) */
  dongs: { dong: string; count: number }[];
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** 최신 계약 먼저(계약월 → 계약일(없으면 뒤) → 보증금 큰 쪽) */
export function sortDealsLatestFirst(deals: readonly NonAptRentDeal[]): NonAptRentDeal[] {
  return [...deals].sort((a, b) => {
    if (a.ym !== b.ym) return b.ym.localeCompare(a.ym);
    const ad = a.day ?? 0;
    const bd = b.day ?? 0;
    if (ad !== bd) return bd - ad;
    return b.depositKrw - a.depositKrw;
  });
}

/**
 * 동·면적대 필터를 걸고 월세·전세로 나눠 중앙값·건수·최근 목록을 만든다.
 * @param recentLimit 목록에 싣는 최근 계약 수(기본 30)
 */
export function summarizeNonAptRent(
  deals: readonly NonAptRentDeal[],
  filter: { dong?: string | null; areaBand?: AreaBandKey | null } = {},
  recentLimit = 30,
): NonAptRentSummary {
  const dong = filter.dong?.trim() || null;
  const areaBand = filter.areaBand ?? null;

  const dongCount = new Map<string, number>();
  for (const d of deals) if (d.dong) dongCount.set(d.dong, (dongCount.get(d.dong) ?? 0) + 1);
  const dongs = [...dongCount.entries()]
    .map(([dong, count]) => ({ dong, count }))
    .sort((a, b) => b.count - a.count || a.dong.localeCompare(b.dong, "ko"));

  const filtered = deals.filter((d) => {
    if (dong && d.dong !== dong) return false;
    if (areaBand && areaBandKeyOf(d.areaM2) !== areaBand) return false;
    return Number.isFinite(d.depositKrw) && d.depositKrw > 0;
  });
  const wolse = sortDealsLatestFirst(filtered.filter((d) => d.monthlyKrw > 0));
  const jeonse = sortDealsLatestFirst(filtered.filter((d) => d.monthlyKrw <= 0));

  return {
    filter: { dong, areaBand },
    wolse: {
      count: wolse.length,
      medianDepositKrw: median(wolse.map((d) => d.depositKrw)),
      medianMonthlyKrw: median(wolse.map((d) => d.monthlyKrw)),
      deals: wolse.slice(0, recentLimit),
    },
    jeonse: {
      count: jeonse.length,
      medianDepositKrw: median(jeonse.map((d) => d.depositKrw)),
      medianMonthlyKrw: null,
      deals: jeonse.slice(0, recentLimit),
    },
    dongs,
  };
}

/** DB 행(market_transactions) → 한 건. 필수값(계약월·보증금·유형)이 어긋나면 null. */
export function rowToNonAptDeal(r: Record<string, unknown>): NonAptRentDeal | null {
  const ym = String(r.contract_ym ?? "");
  const type = String(r.property_type ?? "");
  if (!/^\d{6}$/.test(ym)) return null;
  if (!(NONAPT_PROPERTY_TYPES as readonly string[]).includes(type)) return null;
  const deposit = Number(r.deposit_krw);
  if (!Number.isFinite(deposit) || deposit <= 0) return null;
  const monthly = Number(r.monthly_rent_krw ?? 0) || 0;
  const area = r.area_m2 == null ? null : Number(r.area_m2);
  const day = r.contract_day == null ? null : Number(r.contract_day);
  const floor = r.floor == null ? null : Number(r.floor);
  const by = r.build_year == null ? null : Number(r.build_year);
  const name = String(r.complex_name ?? "").trim();
  return {
    ym,
    day: day != null && Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
    type: type as NonAptPropertyType,
    dong: dongOfAddress(typeof r.address === "string" ? r.address : null),
    areaM2: area != null && Number.isFinite(area) && area > 0 ? area : null,
    floor: floor != null && Number.isFinite(floor) && floor !== 0 ? floor : null,
    depositKrw: deposit,
    monthlyKrw: monthly > 0 ? monthly : 0,
    /* 단독다가구는 nameField 가 houseType("단독"/"다가구") — 건물명이 아니다 */
    buildingName: type === "house" || !name ? null : name,
    buildYear: by != null && Number.isFinite(by) && by > 1900 ? by : null,
  };
}
