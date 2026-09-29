import "server-only";
/* [1025 · 브리핑] /complex/[id]/brief 의 서버 재료 — 단지 상세(page.tsx)와 **같은 로더·같은 규칙**을 부른다(별도 질의 규칙을
   만들지 않는다). 대표행(getComplexBaseById → enrichComplexRow) → 나란히: 매매 한 건 목록(해제 포함 — 주의 줄 재료) ·
   매매 12개월 원표본 + 전월세 원표본(전세가율 — complex-facts 같은 규칙) · 관리비(K-apt) · 학교(POI) · 실거래 기준일.
   곁다리는 5초 공유 예산(settle) — 실패·초과는 null(모른다)로 넘겨 화면이 "—"·"조회 실패"로 정직하게 그린다. 대표행 실패는
   던진다(null 로 바꾸면 조회 실패가 404 로 위장돼 ISR 에 얼어붙는다 — page.tsx 와 같은 판단). */
import { cache } from "react";
import { logger } from "@/lib/log";
import {
  enrichComplexRow,
  getComplexBaseById,
  getComplexDeals,
  decodeComplexId,
  type ComplexRow,
  type HubDealMaybeCancelled,
} from "@/lib/complex/complex-store";
import { getTradeWindowSamples } from "@/lib/complex/complex-trade-window";
import { buildComplexFacts, type ComplexFacts, type RentSample, type TradeSample } from "@/lib/complex/complex-facts";
import { getComplexMgmtFeeSummary, type ComplexMgmtFeeSummary } from "@/lib/complex/mgmt-fee";
import { getNearbyPoi, type NearbyPoi } from "@/lib/poi/store";
import { geocodeAndCache } from "@/lib/map/complex-geocode";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { settle, startDeadline } from "@/lib/data/section-budget";
import { loadRentHistory, sectionRegionLabel } from "../section-loaders";

/** 대표행 상한 — page.tsx COMPLEX_ROW_TIMEOUT_MS 와 같은 값(평시 수십 ms) */
const ROW_TIMEOUT_MS = 4_000;
/** 대장 보강 상한 — 넘기면 base 로 계속(page.tsx 와 같은 판단) */
const ENRICH_TIMEOUT_MS = 2_500;
/** 곁다리 공유 예산 */
const SIDE_BUDGET_MS = 5_000;

function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run(ac.signal),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new Error(`${label} (${ms}ms)`));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export interface BriefData {
  row: ComplexRow;
  /** 매매 한 건 목록(해제 행 포함 — cancelled 표식) · null = 조회 실패 */
  deals: HubDealMaybeCancelled[] | null;
  facts: ComplexFacts;
  /** K-apt 관리비 요약 — kapt 코드 없음·표 없음·실패는 null */
  mgmt: ComplexMgmtFeeSummary | null;
  /** 도보권 학교·역 — 좌표 없음·실패는 null */
  poi: NearbyPoi | null;
  /** 실거래 마지막 적재일 "YYYY.MM.DD" — 실패는 null */
  freshness: string | null;
}

const loadRow = cache(async (id: string): Promise<ComplexRow | null> => {
  const base = await withTimeout((s) => getComplexBaseById(id, s), ROW_TIMEOUT_MS, "단지 정보 조회 시간 초과");
  if (!base) return null;
  try {
    return await withTimeout((s) => enrichComplexRow(base, s), ENRICH_TIMEOUT_MS, "단지 대장 보강 시간 초과");
  } catch (e) {
    logger.warn("[brief] 대장 보강 상한 초과 — 실거래만으로 계속", { id, message: e instanceof Error ? e.message : String(e) });
    return base;
  }
});

/** 메타데이터·본문이 같은 요청 안에서 한 번만 조회한다 */
export const loadBriefRow = loadRow;

async function loadCoords(row: ComplexRow): Promise<{ lat: number; lng: number } | null> {
  if (typeof row.lat === "number" && typeof row.lng === "number") return { lat: row.lat, lng: row.lng };
  const dec = decodeComplexId(row.canonical_id);
  if (!dec) return null;
  const c = await geocodeAndCache(dec.region, dec.name, row.address ?? undefined);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export const loadBrief = cache(async (id: string): Promise<BriefData | null> => {
  const row = await loadRow(id);
  if (!row) return null;
  const budget = startDeadline(SIDE_BUDGET_MS);
  const region = sectionRegionLabel(row.city, row.district);
  const [dealsR, tradesR, rentsR, mgmtR, poiR, freshR] = await Promise.all([
    settle(`${row.name} 브리핑 매매 목록`, getComplexDeals(row.canonical_id, { includeCancelled: true }), budget.expired),
    settle(`${row.name} 브리핑 매매 원표본`, getTradeWindowSamples(row.canonical_id, 11, budget.signal), budget.expired),
    settle(`${row.name} 브리핑 전월세`, loadRentHistory(region, row.name), budget.expired),
    row.kapt_code
      ? settle(`${row.name} 브리핑 관리비`, getComplexMgmtFeeSummary(row.kapt_code, budget.signal), budget.expired)
      : Promise.resolve({ ok: true as const, data: null as ComplexMgmtFeeSummary | null }),
    settle(
      `${row.name} 브리핑 학교`,
      loadCoords(row).then((c) => (c ? getNearbyPoi(c.lat, c.lng) : null)),
      budget.expired,
    ),
    settle("실거래 기준일", getMarketFreshnessDateLabel(), budget.expired),
  ]);
  budget.done();

  const trades: TradeSample[] | null = tradesR.ok ? tradesR.data : null;
  /* 로더의 null 은 "24개월 신고 없음"(complex-rent.ts) → 원표본 []. 실패는 null(모른다) */
  const rents: RentSample[] | null = rentsR.ok ? (rentsR.data?.samples ?? []) : null;
  const facts = buildComplexFacts({ complex: row, trades, rents, notes: null });
  return {
    row,
    deals: dealsR.ok ? dealsR.data : null,
    facts,
    mgmt: mgmtR.ok ? mgmtR.data : null,
    poi: poiR.ok ? poiR.data : null,
    freshness: freshR.ok ? freshR.data : null,
  };
});
