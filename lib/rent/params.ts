/**
 * [1024 · 원룸·오피스텔] /rent/[region] 의 순수 규칙 — 쿼리 해석 · 면적대 라벨 · 빈 상태 사실 문장 · 사이트맵 경로.
 * server-only 없음(클라이언트 필터·테스트가 같은 함수를 쓴다). 데이터 조회는 lib/market/rent-nonapt.ts(담당 Q).
 */
import {
  AREA_BANDS,
  NONAPT_PROPERTY_TYPES,
  NONAPT_TYPE_LABEL,
  isAreaBandKey,
  type AreaBandKey,
  type NonAptPropertyType,
} from "@/lib/market/rent-nonapt-core";
import type { SeoulDistrictInfo } from "@/lib/map/seoul-districts";

export { AREA_BANDS, NONAPT_PROPERTY_TYPES, NONAPT_TYPE_LABEL };
export type { AreaBandKey, NonAptPropertyType };

export const DEFAULT_RENT_TYPE: NonAptPropertyType = "officetel";
/** 요약 표본 기간(캘린더 월, 당월 포함) — rent-nonapt.ts 기본값과 같다 */
export const RENT_MONTHS = 3;

export type RentParams = {
  type: NonAptPropertyType;
  /** 법정동(주소에서 뽑은 토큰) — 없으면 시군구 전체 */
  dong: string | null;
  areaBand: AreaBandKey | null;
};

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function first(sp: SearchParamsLike, key: string): string | null {
  if (sp instanceof URLSearchParams) return sp.get(key);
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s == null ? null : s;
}

export function parseRentType(v: string | null | undefined): NonAptPropertyType {
  return v && (NONAPT_PROPERTY_TYPES as readonly string[]).includes(v) ? (v as NonAptPropertyType) : DEFAULT_RENT_TYPE;
}

/** 동 이름 — 공백 제거 · 24자 상한 · 동/읍/면/가/리 로 끝나는 토큰만(주소 규칙 dongOfAddress 와 같은 꼴). 아니면 null */
export function parseRentDong(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().replace(/\s+/g, "");
  if (!s || s.length > 24) return null;
  return /(동|읍|면|가|리)$/.test(s) && !/^\d/.test(s) ? s : null;
}

export function parseRentParams(sp: SearchParamsLike): RentParams {
  const area = first(sp, "area");
  return {
    type: parseRentType(first(sp, "type")),
    dong: parseRentDong(first(sp, "dong")),
    areaBand: isAreaBandKey(area) ? area : null,
  };
}

/** 기본값(오피스텔 · 전체 동 · 전체 면적)은 쿼리에 적지 않는다 — 같은 화면이 두 주소를 갖지 않게 */
export function rentSearch(p: RentParams): string {
  const sp = new URLSearchParams();
  if (p.type !== DEFAULT_RENT_TYPE) sp.set("type", p.type);
  if (p.dong) sp.set("dong", p.dong);
  if (p.areaBand) sp.set("area", p.areaBand);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function rentHref(regionId: string, p: RentParams): string {
  return `/rent/${encodeURIComponent(regionId)}${rentSearch(p)}`;
}

/** 면적대 라벨 — null 은 "전체" */
export function areaBandLabel(key: AreaBandKey | null): string {
  if (!key) return "전체 면적";
  return AREA_BANDS.find((b) => b.key === key)?.label ?? "전체 면적";
}

/** 섹션 캡션의 짧은 면적 표기 — "~30㎡" · "30~60㎡" · "60㎡~" · null 은 "전체" */
export function areaBandShort(key: AreaBandKey | null): string {
  switch (key) {
    case "s":
      return "~30㎡";
    case "m":
      return "30~60㎡";
    case "l":
      return "60㎡~";
    default:
      return "전체 면적";
  }
}

/** 화면 제목 — 동이 있으면 동, 없으면 시군구 */
export function rentTitle(regionName: string, dong: string | null): string {
  return `${dong ?? regionName} 원룸·오피스텔 실거래 월세`;
}

/**
 * 머리 아래 사실 캡션(t-caption). 숫자는 페이지가 이미 가진 값만.
 *  · 행이 하나도 없으면(수집 전) — "신고된 실거래 · 매물 아님 / {지역} 오피스텔·연립·단독 전월세 수집 전 / 아파트 전월세는 단지 화면"
 *  · 있으면 — "신고된 실거래 · 매물 아님 / {유형} 최근 N개월 M건 / 아파트 전월세는 단지 화면"
 */
export function rentFacts(
  regionName: string,
  totalRows: number,
  sampleCount: number,
  typeLabel: string = NONAPT_TYPE_LABEL[DEFAULT_RENT_TYPE],
  months = RENT_MONTHS,
): string[] {
  const head = "신고된 실거래 · 매물 아님";
  const tail = "아파트 전월세는 단지 화면";
  if (totalRows <= 0) return [head, `${regionName} 오피스텔·연립·단독 전월세 수집 전`, tail];
  return [head, `${typeLabel} 최근 ${months}개월 ${sampleCount.toLocaleString("ko-KR")}건`, tail];
}

/** noindex 규칙 — 이 지역에 비아파트 전월세 행이 0 이면 색인하지 않는다(빈 페이지를 크롤러에게 팔지 않는다) */
export function rentNoindex(counts: Record<NonAptPropertyType, number> | null): boolean {
  if (!counts) return true;
  return NONAPT_PROPERTY_TYPES.every((t) => (counts[t] ?? 0) <= 0);
}

export function rentTotalRows(counts: Record<NonAptPropertyType, number> | null): number {
  if (!counts) return 0;
  return NONAPT_PROPERTY_TYPES.reduce((a, t) => a + (counts[t] ?? 0), 0);
}

/** 수도권(서울·경기·인천) 카탈로그 항목 — 비아파트 수집 범위와 같다(molit-nonapt-ingest 는 11·41·28 만). 폐지 지역 제외 */
export const SUDOGWON_CITIES: ReadonlySet<string> = new Set(["서울", "경기", "인천"]);

export function isSudogwonRegion(r: Pick<SeoulDistrictInfo, "city" | "retired">): boolean {
  if (r.retired) return false;
  const city = (r.city ?? "").trim() || "서울";
  return SUDOGWON_CITIES.has(city);
}

/**
 * 사이트맵에 실을 /rent 경로 — 행이 있는 지역만(0행 페이지는 noindex 라 싣지 않는다).
 * 하나라도 있으면 목록 /rent 도 같이 싣는다.
 */
export function rentSitemapPaths(counts: ReadonlyArray<{ id: string; total: number }>): string[] {
  const out: string[] = [];
  for (const c of counts) if (c.total > 0) out.push(`/rent/${encodeURIComponent(c.id)}`);
  if (out.length > 0) out.unshift("/rent");
  return out;
}

/** 계약일 표기 — "2026.09.14" · 일자가 없으면 "2026.09" */
export function contractDateLabel(ym: string, day: number | null): string {
  const base = `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
  return day != null ? `${base}.${String(day).padStart(2, "0")}` : base;
}
