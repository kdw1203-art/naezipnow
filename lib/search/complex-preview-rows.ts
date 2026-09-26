/**
 * [1008 · S] search_complexes_preview RPC 행 → 검색 결과 한 줄(순수 함수 — 서버 경로·테스트 공용).
 * 부르는 곳: lib/search/complex-search.ts(server-only). 테스트: tests/unit/complex-search-1008.
 */
import { parseDong } from "@/lib/complex/dong";
import type { ComplexPreview } from "@/lib/search/complex-preview";
import {
  METRO_REGION,
  compareMatches,
  matchComplex,
  type ParsedComplexQuery,
} from "@/lib/search/complex-match";

export type PreviewRow = {
  complex_id: string;
  region_name: string;
  complex_name: string;
  address: string | null;
  trade_count: number | null;
  recent_trade_count: number | null;
  avg_price_manwon: number | null;
  avg_area_m2: number | null;
  build_year: number | null;
  households: number | null;
  lat: number | null;
  lng: number | null;
  sim: number | null;
  /** v2: 이름·토큰으로 맞음(false = 비슷한 이름 · 오타 추정). 직전 정의(v1)에서는 "앞글자 일치" 였다. */
  exact: boolean | null;
};

export interface ComplexSearchHit extends ComplexPreview {
  /** 대표 지번 주소 */
  address: string | null;
  lat: number | null;
  lng: number | null;
  tradeCount: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** fuzzy = 이름·토큰으로 맞지 않은 '비슷한 이름'(오타 추정) */
export function previewRowToHit(r: PreviewRow, fuzzy: boolean): ComplexSearchHit {
  const region = (r.region_name ?? "").trim();
  return {
    id: r.complex_id,
    name: r.complex_name,
    region,
    area: parseDong(r.address),
    address: r.address?.trim() || null,
    households: num(r.households),
    recentTradeCount: num(r.recent_trade_count),
    tradeCount: num(r.trade_count),
    avgPriceManwon: num(r.avg_price_manwon),
    buildYear: num(r.build_year),
    lat: num(r.lat),
    lng: num(r.lng),
    fuzzy,
  };
}

/**
 * RPC 행을 같은 규칙(TS)으로 한 번 더 줄 세우고 "비슷한 이름" 을 판정한다.
 *
 * 왜: "비슷한 이름" 표시를 RPC 의 exact 로 정하면, v1(직전 정의 — exact 는 "앞글자 일치")이 돌고 있는
 * 동안 정상 결과("힐스테이트광교")까지 '비슷한 이름' 으로 칠해지고 순서도 v1 그대로("힐스테이트@이천"
 * 먼저)다. TS 규칙은 v2 SQL 과 같은 순서를 낸다(2026-09-21 운영 재현 6개 질의·26행 — 순서·판정 불일치 0).
 * v2 적용 뒤에는 순서가 그대로이고, 적용 전에는 v1 이 준 후보 안에서라도
 * 제 순서가 된다. 규칙에 전혀 안 맞는 행(v1 의 느슨한 후보)은 버리지 않고 맨 뒤 '비슷한 이름' 으로 둔다.
 */
export function rankPreviewRows(pq: ParsedComplexQuery, rows: PreviewRow[]): ComplexSearchHit[] {
  /* [1008 · 리뷰 B] 초성(자모만 2자 이상)은 RPC 의 초성 갈래가 초성 일치로 줄 세운 결과다 — 이름 규칙으로 다시
     보면 정규화 키가 "" 라 전부 '비슷한 이름' 이 됐다("ㄹㅁㅇ" 8행이 SQL 에선 exact). 순서·판정을 그대로 둔다. */
  if (pq.chosung) return rows.map((r) => previewRowToHit(r, false));
  /* 도를 버린 질의("경기 광주 …")에 광역·특별시 구는 후보가 아니다 — v3 는 SQL 에서 빼지만, v2 가 돌고 있는
     동안에도 같은 결과가 되게 여기서도 뺀다. */
  if (pq.doContext) rows = rows.filter((r) => !METRO_REGION.test((r.region_name ?? "").trim()));
  const withMatch = rows.map((r, i) => {
    const m = matchComplex(pq, { name: r.complex_name, region: (r.region_name ?? "").trim(), address: r.address });
    return { r, m, i };
  });
  withMatch.sort((a, b) => {
    if (!a.m || !b.m) return a.m ? -1 : b.m ? 1 : a.i - b.i;
    const ca = { name: a.r.complex_name, region: a.r.region_name, recentTradeCount: a.r.recent_trade_count, tradeCount: a.r.trade_count, match: a.m };
    const cb = { name: b.r.complex_name, region: b.r.region_name, recentTradeCount: b.r.recent_trade_count, tradeCount: b.r.trade_count, match: b.m };
    return compareMatches(ca, cb) || a.i - b.i;
  });
  return withMatch.map(({ r, m }) => previewRowToHit(r, !m || m.tier === 7));
}
