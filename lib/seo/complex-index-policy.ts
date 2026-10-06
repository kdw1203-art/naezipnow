/**
 * [1040 · 운영 경보 seo.thin_content] 단지 허브의 색인·사이트맵·광고 기준 — 한 곳에서 정한다(순수 함수).
 *
 * 경보(2026-10-05): 사이트맵에 실린 단지 32,153곳 중 11,431곳(35.6%)이 최근 12개월 매매 3건 미만 —
 * 0건 1,772 · 1~2건 9,659. 사이트맵 기준이 "매매 1건 이상(전 기간)" 하나뿐이라, 이력 백필(2021~)로 옛 거래가
 * 들어올수록 지금은 거래가 끊긴 단지가 계속 실렸다.
 *
 * 기준(페이지에 실제로 그려지는 내용으로 가른다):
 *   full   전 기간 매매 3건 이상 **그리고** 최근 12개월에 1건 이상 → 사이트맵 · 색인 · 광고
 *   stale  전 기간 3건 이상인데 최근 12개월 0건                  → 사이트맵 X · 색인 O(이력 그래프가 있다) · 광고 X
 *   sparse 전 기간 1~2건                                         → 사이트맵 X · 최근 12개월 거래가 있으면 색인 O, 없으면 X · 광고 X
 *   none   0건                                                   → 사이트맵 X · 색인 X(예전과 같다) · 광고 X
 *
 * 사이트맵 ⊂ 색인 — 사이트맵에 실린(full) 단지는 최근 12개월 거래가 있으므로 페이지의 색인 조건(아래 complexPageIndexable)을
 * 반드시 통과한다. "제출했는데 noindex"(seo.asset 경보)가 생기지 않는다.
 */

export type ComplexIndexTier = "full" | "stale" | "sparse" | "none";

export const INDEX_MIN_TOTAL_TRADES = 3;
export const INDEX_RECENT_MONTHS = 12;

/** yyyymm 에서 n 개월 전(음수 = 과거). 형식이 아니면 빈 문자열 */
function shiftYm(yyyymm: string, delta: number): string {
  if (!/^\d{6}$/.test(yyyymm)) return "";
  const d = new Date(Date.UTC(Number(yyyymm.slice(0, 4)), Number(yyyymm.slice(4, 6)) - 1 + delta, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 오늘(KST)의 yyyymm */
export function kstYm(nowMs: number = Date.now()): string {
  const d = new Date(nowMs + 9 * 3_600_000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 마지막 계약월이 최근 12개월(당월 포함) 안인가 */
export function isRecentContractYm(lastYm: string | null | undefined, nowYm: string): boolean {
  const start = shiftYm(nowYm, -(INDEX_RECENT_MONTHS - 1));
  return !!lastYm && /^\d{6}$/.test(lastYm) && !!start && lastYm >= start && lastYm <= nowYm;
}

/** 사이트맵 쪽 — 집계 표의 (전 기간 건수, 마지막 계약월)로 */
export function complexIndexTier(totalTrades: number, lastYm: string | null | undefined, nowYm: string): ComplexIndexTier {
  const total = Number.isFinite(totalTrades) ? totalTrades : 0;
  if (total <= 0) return "none";
  if (total < INDEX_MIN_TOTAL_TRADES) return "sparse";
  return isRecentContractYm(lastYm, nowYm) ? "full" : "stale";
}

export function tierInSitemap(tier: ComplexIndexTier): boolean {
  return tier === "full";
}

/**
 * 페이지 쪽 색인 여부 — 페이지가 읽은 창(24개월)의 건수와 최근 12개월 건수로.
 * 최근 12개월에 1건이라도 있거나, 창 안에 3건 이상이면 색인한다. 둘 다 아니면(창 안 0~2건 · 최근 1년 0건) noindex.
 */
export function complexPageIndexable(windowTrades: number, recent12mTrades: number): boolean {
  return recent12mTrades >= 1 || windowTrades >= INDEX_MIN_TOTAL_TRADES;
}

/** 광고 칸 — 내용이 얇은 화면에는 두지 않는다. 건수를 못 읽었으면(null) 예전대로 둔다 */
export function complexShowsAds(windowTrades: number | null): boolean {
  return windowTrades == null || windowTrades >= INDEX_MIN_TOTAL_TRADES;
}
