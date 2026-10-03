/**
 * [1009 · H] 홈 "오늘의 한 줄" 지역 문장 — 순수 함수(테스트로 잠근다).
 *
 * 왜(2026-09-22 실측 · 코드 확인):
 *  · 변동률을 모르는 카드("변동 미상")도 tone 이 "flat" 이라 문장이 **"전월과 비슷해요"** 가 됐다 — 모르는 것을
 *    "그대로"라고 말한 것이다. 모르면 비교 구절을 아예 쓰지 않는다.
 *  · 스냅샷 카드는 가격이 부동산원 **평균가**, 변동률은 부동산원 **매매가격지수** 전월비다. "평균이 5.08억, 전월보다
 *    0.8% 올랐어요"는 평균가가 0.8% 오른 것처럼 읽혔다 — 기준을 문장에 적는다("시세 지수는 …").
 *  · 보합 문턱을 사이트 표준(|변동| < 0.05%, lib/format/delta.ts)으로 맞춘다 — 예전 문장은 0.1% 문턱이라 0.08% 상승을
 *    "비슷해요"라고, 같은 화면의 배지는 "▲ 0.1%"라고 말했다.
 */
import { DELTA_ARROW, absPctText, deltaDir } from "@/lib/format/delta";
import { DELTA_UNKNOWN } from "@/lib/newui/delta-label";
import type { KpiRegion } from "./HomeKpiRow";

/** 옛 응답(changePct 없음)의 "▲ 1.2%" 문자열 → 부호 있는 숫자. 모르면 null */
function pctFromDelta(delta: string): number | null {
  if (!delta || delta === DELTA_UNKNOWN) return null;
  const m = /([▲▼—])?\s*([0-9]+(?:\.[0-9]+)?)%/.exec(delta);
  if (!m) return null;
  const v = Number(m[2]);
  if (!Number.isFinite(v)) return null;
  return m[1] === "▼" ? -v : m[1] === "▲" ? v : 0;
}

/** "202607" → "7월" · 아니면 null */
function monthOf(ym: string | null | undefined): string | null {
  return ym && /^\d{6}$/.test(ym) ? `${Number(ym.slice(4, 6))}월` : null;
}

export function todayRegionSentence(r: KpiRegion): string {
  /* [1029 · 1] 낱말 꼴 — "강남구 8월 · 아파트 평균 28.6억 · 시세 지수 전월 대비 ▼0.4%". 문장("…내렸어요")을 접었다.
     기준월·기준(지수/평당가)·방향 기호는 그대로 적는다 — 모르면 비교 구절을 쓰지 않는다([1009 · H]). */
  const head = r.periodLabel ? `${r.name} ${r.periodLabel}` : r.name;
  const vs = r.periodLabel ? "전월 대비" : "지난달 대비";
  const avg = r.priceKind === "molit" ? "아파트 실거래 평균" : "아파트 평균";
  const pct = r.changePct !== undefined ? r.changePct : pctFromDelta(r.delta);
  const dir = deltaDir(pct);
  if (dir === null) return `${head} · ${avg} ${r.price}`;
  const change = dir === "flat" ? `${vs} 보합` : `${vs} ${DELTA_ARROW[dir]}${absPctText(pct as number)}`;
  /* 등락의 달이 가격의 달과 다르면 그 달을 적는다(예: 가격 7월 · 지수 8월) */
  const changeMonth = monthOf(r.changeYm);
  const at = changeMonth && changeMonth !== r.periodLabel ? `${changeMonth} ` : "";
  if (r.changeBasis === "index") return `${head} · ${avg} ${r.price} · ${at}시세 지수 ${change}`;
  /* 월 집계 카드의 변동률은 평균 거래가가 아니라 **평당가 평균**의 전월비다(DB refresh_market_region_monthly) */
  if (r.changeBasis === "avg") return `${head} · ${avg} ${r.price} · ${at}평당가 ${change}`;
  return `${head} · ${avg} ${r.price} · ${at}${change}`;
}

/**
 * [1009 · H 리뷰] "오늘의 한 줄" 거래 — 건수의 **실제 달과 원천**으로만. 없으면 null(슬라이드를 만들지 않는다).
 * 국토부 월 집계는 **계약월** 기준이라 "7월 계약"이라고 적는다. [1029 · 1] 낱말 꼴.
 */
export function todayTradeSentence(r: KpiRegion): string | null {
  if (!r.tradeLabel) return null;
  const m = monthOf(r.tradesYm);
  if (m && r.tradesSource === "molit") return `${r.name} ${m} 계약 · 아파트 매매 ${r.tradeLabel} 신고`;
  if (m && r.tradesSource === "reb") return `${r.name} ${m} · 아파트 매매 ${r.tradeLabel} · 한국부동산원 집계`;
  return `${r.name} · 최근 아파트 매매 ${r.tradeLabel} 신고`;
}
