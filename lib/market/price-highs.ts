import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { threeYearsAgoYm, type PriceHighRow } from "./price-record-copy";
import {
  collectFreshGroups,
  isNewHigh,
  priorAreaRange,
  toPriceHighRow,
  utcYmMonthsAgo,
  type FreshGroup,
  type FreshTradeRow,
} from "./price-highs-core";

/* ============================================================
   [1103] 신고가 탐지 — RPC detect_new_price_highs 를 앱 쪽 "작은 조회 여러 번"으로 바꿨다.

   왜(운영 사실): 신고가 크론(/api/cron/price-record-watch · 2026-11-03T13:23)과 주간 시황(/api/cron/weekly-market-post ·
   2026-11-02T14:22)이 둘 다 "57014 canceling statement due to statement timeout". 이 RPC 는 한 문장 안에서
     ① 최근 26시간(주간은 168시간)에 들어온 매매를 (단지, 지역, 반올림 면적)으로 묶고 — 오늘 7,728행 → 4,651묶음
     ② 묶음마다 앞선 3년 이력을 LATERAL 로 센다 — 4,651번.
   ②가 `coalesce(is_cancelled,false)=false` 라 부분 인덱스 mt_trade_complex_cov2_idx(조건 is_cancelled = false · 금액·면적 INCLUDE)를
   못 타고 mt_trade_complex_geo_idx + 힙 읽기로 돈다: 단지 한 곳(헬리오시티 84㎡) 490ms · 힙 609블록(EXPLAIN ANALYZE) —
   같은 조회를 `is_cancelled = false` 로 쓰면 Index Only Scan 18ms · 22블록. 4,651묶음 × 단지 전 매매(합계 42만 행)를 힙에서
   읽으니 함수 자체 상한(`SET statement_timeout = 25s`)을 넘는다 — 운영 요청 13:22:48.9 시작 → 13:23:14.4 57014(≈25.5초).
   끝난 호출도 59회 평균 6.8초 · 최대 22.5초(pg_stat_statements)라 상한 바로 밑에서 돌고 있었다.

   이제 이렇게 한다(같은 규칙 · 같은 숫자):
     ① 새 매매를 **금액 내림차순 · 키셋**(deal_amount_krw desc, id)으로 1,000행씩 — created_at 인덱스, 후보 FRESH_CANDIDATE_CAP 묶음이 차면 멈춘다.
     ② 비싼 묶음부터 PRIOR_CONCURRENCY 개씩 앞선 이력을 묻는다 — 묶음 하나 = 질의 하나(count exact + 최고가 1행 · cov2 Index Only Scan).
        RPC 의 결과는 "조건을 넘긴 묶음 중 금액 상위 limit 건"이므로, 금액 순서대로 보다가 limit 건이 차면 거기서 멈춰도 **같은 답**이다.
   상한: 후보는 FRESH_CANDIDATE_CAP(300) 묶음까지만 본다 — 운영 실측(2026-11-03, 26시간)은 상위 300묶음 중 67건이 조건을 넘었고
   5번째가 34위였다. 상위 300 안에 limit 건이 없으면 있는 만큼만 돌려준다(지어내지 않는다 · 모자란 것은 "없음"이 아니라 "덜 봄").
   실패는 던진다 — 호출부가 그 글/섹션을 접는다(예전 RPC 실패와 같은 계약).
   DB 쪽 고침(함수 본문의 is_cancelled 조건)은 docs/ops-1103-db-proposals.sql 제안 — 적용 전이라도 이 경로는 RPC 를 부르지 않는다.
   ============================================================ */

/** 후보 묶음 상한 — 위 머리 주석의 실측 근거 */
export const FRESH_CANDIDATE_CAP = 300;
/** 새 매매를 읽는 쪽 수 상한(쪽당 1,000행) — 168시간 창(운영 14,233행)도 첫 쪽에서 후보가 찬다 */
const FRESH_MAX_PAGES = 5;
const FRESH_PAGE_ROWS = 1_000;
/** 앞선 이력 조회를 한꺼번에 몇 개 띄우나 — 크론 하나가 연결 풀을 독차지하지 않게 작게 */
const PRIOR_CONCURRENCY = 6;

export type DetectPriceHighsOptions = {
  hours: number;
  minPrior: number;
  margin: number;
  limit: number;
};

type Sb = NonNullable<ReturnType<typeof getServiceSupabase>>;

async function readFreshGroups(sb: Sb, hours: number, now: Date): Promise<FreshGroup[]> {
  const sinceIso = new Date(now.getTime() - hours * 3_600_000).toISOString();
  const ymFrom = utcYmMonthsAgo(1, now);
  const seen = new Set<string>();
  const groups: FreshGroup[] = [];
  let cursor: { deal: number; id: string } | null = null;
  for (let page = 0; page < FRESH_MAX_PAGES && groups.length < FRESH_CANDIDATE_CAP; page++) {
    let q = sb
      .from("market_transactions")
      .select("id, complex_name, region_name, area_m2, deal_amount_krw, contract_ym, contract_day")
      .eq("transaction_type", "trade")
      .eq("property_type", "apartment")
      .eq("is_cancelled", false)
      .gt("created_at", sinceIso)
      .not("deal_amount_krw", "is", null)
      .not("area_m2", "is", null)
      .not("complex_name", "is", null)
      .gte("contract_ym", ymFrom);
    if (cursor) {
      q = q.or(`deal_amount_krw.lt.${cursor.deal},and(deal_amount_krw.eq.${cursor.deal},id.gt.${cursor.id})`);
    }
    const { data, error } = await q
      .order("deal_amount_krw", { ascending: false })
      .order("id", { ascending: true })
      .limit(FRESH_PAGE_ROWS);
    if (error) throw new Error(`market_transactions(새 매매) 조회 실패: ${error.message}`);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const fresh: FreshTradeRow[] = rows.map((r) => ({
      complex_name: String(r.complex_name ?? ""),
      region_name: String(r.region_name ?? ""),
      area_m2: Number(r.area_m2),
      deal_amount_krw: Number(r.deal_amount_krw),
      contract_ym: String(r.contract_ym ?? ""),
      contract_day: r.contract_day == null ? null : Number(r.contract_day),
    }));
    groups.push(...collectFreshGroups(fresh, seen));
    if (rows.length < FRESH_PAGE_ROWS) break;
    const last = rows[rows.length - 1];
    cursor = { deal: Number(last.deal_amount_krw), id: String(last.id) };
  }
  /* 쪽마다 금액 내림차순이고 쪽끼리도 내림차순이라 이어 붙이면 전체가 내림차순이다 */
  return groups.slice(0, FRESH_CANDIDATE_CAP);
}

/** 묶음 하나의 앞선 이력 — RPC LATERAL 과 같은 조건(취소 제외 · 직전 3년 · 계약월 이전 · 면적 ±2) */
async function readPrior(sb: Sb, g: FreshGroup, ymFloor: string): Promise<{ max: number | null; n: number }> {
  const area = priorAreaRange(g.area);
  const { data, count, error } = await sb
    .from("market_transactions")
    .select("deal_amount_krw", { count: "exact" })
    .eq("region_name", g.region_name)
    .eq("complex_name", g.complex_name)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gte("contract_ym", ymFloor)
    .lt("contract_ym", g.contract_ym)
    .gte("area_m2", area.gte)
    .lt("area_m2", area.lt)
    .order("deal_amount_krw", { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) throw new Error(`market_transactions(앞선 이력 ${g.complex_name}) 조회 실패: ${error.message}`);
  const top = (data as Array<{ deal_amount_krw: number | null }> | null)?.[0]?.deal_amount_krw;
  return { max: top == null ? null : Number(top), n: count ?? 0 };
}

/**
 * 신고가 후보 — RPC detect_new_price_highs(p_hours, p_min_prior, p_margin, p_limit) 와 같은 행 모양·같은 규칙.
 * 금액 내림차순 상위 limit 건. 실패는 던진다.
 */
export async function detectNewPriceHighs(opts: DetectPriceHighsOptions, now: Date = new Date()): Promise<PriceHighRow[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const limit = Math.max(1, Math.floor(opts.limit));
  const t0 = Date.now();
  const candidates = await readFreshGroups(sb, opts.hours, now);
  const ymFloor = threeYearsAgoYm(now);
  const out: PriceHighRow[] = [];
  let checked = 0;
  for (let i = 0; i < candidates.length && out.length < limit; i += PRIOR_CONCURRENCY) {
    const batch = candidates.slice(i, i + PRIOR_CONCURRENCY);
    const priors = await Promise.all(batch.map((g) => readPrior(sb, g, ymFloor)));
    checked += batch.length;
    batch.forEach((g, j) => {
      const p = priors[j];
      if (out.length < limit && p.max != null && isNewHigh(g.deal_amount_krw, p, opts.minPrior, opts.margin)) {
        out.push(toPriceHighRow(g, { max: p.max, n: p.n }));
      }
    });
  }
  /* 크론 로그로 "얼마나 봤나"를 남긴다(logger.info 는 운영에서 침묵 — console.info) */
  console.info(
    `[price-highs] hours=${opts.hours} 후보=${candidates.length} 확인=${checked} 결과=${out.length} ${Date.now() - t0}ms`,
  );
  if (candidates.length >= FRESH_CANDIDATE_CAP && out.length < limit) {
    logger.warn(`[price-highs] 상위 ${FRESH_CANDIDATE_CAP}묶음 안에서 ${out.length}건만 찾음 — 상한 안에서만 본다(머리 주석)`);
  }
  return out;
}
