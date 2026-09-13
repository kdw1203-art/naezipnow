/**
 * [995] 단지 SEO 순수 헬퍼 — 읍면동 파싱 · 평형(면적대) 요약 · 최근 12개월 건수.
 *
 * 서버 모듈·React·환경변수를 전혀 import 하지 않는다. generateMetadata·본문·
 * 단위테스트(tests/unit/complex-seo-995.test.ts)가 같은 구현을 본다.
 *
 * 왜 따로 두나: 검색 의도("단지명 시세 / 실거래 / 평형")에 답하는 제목·설명·
 * 첫 화면 칩은 전부 **이미 읽은 데이터**로만 만든다. 읍면동은 대표행에 컬럼이
 * 없고 address 문자열("서울 송파구 잠실동 22")에만 있어서 여기서 잘라 낸다.
 * (master-match.ts 의 parseMtAddress 는 대장 매칭 전용이라 토큰 2개 미만·
 *  시군구 토큰을 다루지 않는다 — SEO 표기는 규칙이 조금 더 넓다.)
 */
import { formatKrwManwon } from "@/lib/format/krw";
import { findCatalogRegionByName, normalizeRegionKey } from "@/lib/region/catalog";

/** 읍면동 토큰 판정 — 한글로 시작하고 동/읍/면/가/리 로 끝나는 2자 이상 토큰.
 *  "101동"(건물 동 번호)처럼 숫자로 시작하는 것은 읍면동이 아니다. */
const EMD_RE = /^[가-힣][가-힣0-9]*[동읍면가리]$/;
/** 지번·번지 토큰 — 여기서부터는 주소의 "번지" 부분이라 읍면동이 나올 수 없다 */
const JIBUN_RE = /^\d/;

/**
 * 주소 문자열에서 읍면동을 뽑는다. 없으면 null(지어내지 않는다).
 *
 *   "서울 송파구 잠실동 22"            → "잠실동"
 *   "강북구 미아동 1353"               → "미아동"
 *   "충청남도 공주시 금흥동"           → "금흥동"
 *   "경기도 성남시 분당구 정자동 1"    → "정자동"
 *   "세종특별자치시 한솔동"            → "한솔동"
 *   "상리"                              → "상리"
 *   "서울 송파구 올림픽로 435"(도로명) → null
 *
 * 규칙: 공백으로 나눈 토큰을 앞에서부터 보다가 숫자로 시작하는 토큰(지번)을
 * 만나면 멈추고, 그 전까지 나온 읍면동 토큰 중 **마지막** 것을 돌려준다.
 * 시/군/구/도 로 끝나는 토큰은 판정식에 걸리지 않으므로 자연히 무시된다.
 */
export function parseDong(address: string | null | undefined): string | null {
  const raw = (address ?? "").trim();
  if (!raw) return null;
  let found: string | null = null;
  for (const tok0 of raw.split(/\s+/)) {
    /* 괄호·쉼표 같은 장식은 떼고 본다 — "잠실동(22)" 같은 표기 */
    const tok = tok0.replace(/[^가-힣0-9]/g, "");
    if (!tok) continue;
    if (JIBUN_RE.test(tok)) break;
    if (EMD_RE.test(tok)) found = tok;
  }
  return found;
}

/**
 * 지역 허브(/region/{id}) id — 단지 페이지의 브레드크럼 칩·JSON-LD 탐색경로·"시장 보기"
 * 알약이 같은 값을 쓴다.
 *
 * 예전 알약은 `regionIdForName(city) ?? regionIdForName(dong)` 이었다. 카탈로그 조회가
 * 부분 일치까지 하므로 city="부산" 만 넣어도 "부산 중구"(busan-jung)가 나온다 — 부산의
 * 모든 단지가 중구 허브로 이어지고 있었다. 탐색경로(JSON-LD)에 그 링크를 실으면 색인
 * 신호가 엉뚱한 지역으로 가므로, 시/도+시군구로 찾고 **찾은 항목의 시/도가 대표행과
 * 같을 때만** 쓴다. 못 찾으면 null — 링크·탐색경로 단계를 지어내지 않는다.
 */
export function resolveRegionId(
  city: string | null | undefined,
  district: string | null | undefined,
): string | null {
  const c = (city ?? "").trim();
  const d = (district ?? "").trim();
  if (!d) return null;
  const info =
    findCatalogRegionByName(c && c !== d ? `${c} ${d}` : d) ?? findCatalogRegionByName(d);
  if (!info) return null;
  /* 카탈로그의 city 미지정은 서울이다(lib/map/seoul-districts.ts SeoulDistrictInfo.city) */
  const infoCity = info.city ?? "서울";
  if (c && normalizeRegionKey(infoCity) !== normalizeRegionKey(c)) return null;
  return info.id;
}

/** 면적대 행의 최소 모양 — complex-store AreaBandRow 와 구조적으로 호환 */
export interface AreaBandLike {
  label: string;
  count: number;
  latestManwon: number;
  latestYm?: string;
}

/** 거래 건수 많은 순으로 상위 limit 개(같은 건수면 원래 순서 = 면적 오름차순 유지) */
export function topAreaBands<T extends AreaBandLike>(
  bands: readonly T[] | null | undefined,
  limit = 2,
): T[] {
  if (!bands || bands.length === 0 || limit <= 0) return [];
  return bands
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.count > 0 && Number.isFinite(b.latestManwon) && b.latestManwon > 0)
    .sort((x, y) => y.b.count - x.b.count || x.i - y.i)
    .slice(0, limit)
    .map(({ b }) => b);
}

/** 만원 → "12.5억"/"9,800만" — 단지 허브 공통 eok1 규칙(lib/complex/hub-trades formatManwon 과 동일) */
export function bandPriceLabel(manwon: number): string {
  return formatKrwManwon(manwon, { style: "eok1" });
}

/**
 * 제목·설명용 평형 요약 — "60~85㎡ 12.5억 · ~59㎡ 9.8억". 재료가 없으면 "".
 * 라벨은 면적대 구간 라벨(lib/market/bands.ts)을 그대로 쓴다 — "84㎡" 같은 대표
 * 면적은 데이터에 없으므로 만들어 쓰지 않는다. 가격은 그 구간의 **최근** 실거래.
 */
export function areaBandTitle(
  bands: readonly AreaBandLike[] | null | undefined,
  fmt: (manwon: number) => string = bandPriceLabel,
  limit = 2,
): string {
  return topAreaBands(bands, limit)
    .map((b) => `${b.label} ${fmt(b.latestManwon)}`)
    .join(" · ");
}

/** "202608" → "26.8월" (제목의 기준월 표기와 같은 얼굴). 형식이 아니면 null */
export function ymShortLabel(ym: string | null | undefined): string | null {
  if (!ym || !/^\d{6}$/.test(ym)) return null;
  const month = Number(ym.slice(4));
  if (month < 1 || month > 12) return null;
  return `${ym.slice(2, 4)}.${month}월`;
}

/** 월별 건수 행의 최소 모양 — priceSeries(PricePoint)·ComplexTransactionRow 둘 다 맞는다 */
export interface MonthCountLike {
  yyyymm?: string;
  ym?: string;
  deal_count?: number;
  dealCount?: number;
}

/** YYYYMM 에서 n개월 앞의 YYYYMM (n=11 이면 12개월 창의 시작월) */
export function shiftYm(ym: string, months: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + months;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, "0")}`;
}

/**
 * 기준월(nowYm)로 끝나는 최근 `months`개월 창 안의 실거래 건수 합.
 * 월별 행은 거래가 있는 달만 있으므로 "마지막 12개 행"이 아니라 달력으로 센다.
 * nowYm 형식이 아니면 0(창을 지어내지 않는다).
 */
export function countDealsInWindow(
  rows: readonly MonthCountLike[] | null | undefined,
  nowYm: string,
  months = 12,
): number {
  if (!rows || rows.length === 0 || !/^\d{6}$/.test(nowYm) || months <= 0) return 0;
  const start = shiftYm(nowYm, -(months - 1));
  let n = 0;
  for (const r of rows) {
    const ym = r.yyyymm ?? r.ym ?? "";
    if (ym < start || ym > nowYm) continue;
    const c = r.deal_count ?? r.dealCount ?? 0;
    if (Number.isFinite(c) && c > 0) n += c;
  }
  return n;
}
