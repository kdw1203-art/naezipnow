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
import { absPctText, deltaDir, deltaVerb } from "@/lib/format/delta";
import { DELTA_UNKNOWN } from "@/lib/newui/delta-label";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import type { KpiRegion } from "./HomeKpiRow";

/* [v4 · 규칙 3] 회전 배너("오늘의 한 줄")는 걷혔다 — 화면은 명사형 행(지역 이름 / 가격 · 등락)으로 줄였고, 이 파일의
   문장은 그 행의 **접근성 이름**(aria-label)이 된다. 행이 줄여 쓴 기준(평균의 종류·등락의 달·지수/평당가)을 화면 읽기
   사용자에게는 온전한 한 문장으로 준다 — 같은 규칙을 두 번 쓰지 않도록 문장 규칙은 그대로 여기 한 곳. */

/** 지역 카드(HomeRegionCard) → 문장 재료(KpiRegion). 서버 행과 로그인 관심지역 행이 같이 쓴다. */
export function kpiRegionOf(r: HomeRegionCard): KpiRegion {
  return {
    name: r.name,
    price: r.price,
    delta: r.delta,
    tone: r.tone,
    /* 건수는 trades(제 달·원천이 함께 있다)만 — meta 의 "N건"은 달을 모른다([1009 · H 리뷰]) */
    tradeLabel: typeof r.trades === "number" && r.trades > 0 ? `${r.trades.toLocaleString("ko-KR")}건` : null,
    href: r.href,
    periodLabel: r.periodLabel,
    changePct: r.changePct ?? null,
    changeBasis: r.changeBasis,
    changeYm: r.changeYm ?? null,
    tradesYm: r.tradesYm ?? null,
    tradesSource: r.tradesSource,
    priceKind: r.stale ? "molit" : "reb",
  };
}

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
  /* 기준월을 문장에 적는다 — "지난달보다"만 있으면 9월에 읽는 사람은 8월 대비로 오해한다([950]) */
  const when = r.periodLabel ? `${r.periodLabel} ` : "";
  const vs = r.periodLabel ? "전월보다" : "지난달보다";
  /* [1009 · H 리뷰] 가격이 국토부 신고 실거래 평균(월 집계 카드)이면 그렇게 적는다 — "시세" 낱말 규칙 */
  const avg = r.priceKind === "molit" ? "아파트 실거래 평균" : "아파트 평균";
  const pct = r.changePct !== undefined ? r.changePct : pctFromDelta(r.delta);
  const dir = deltaDir(pct);
  if (dir === null) return `${r.name} ${when}${avg}은 ${r.price}이에요.`; // "억"·"만" 은 받침 — 이에요
  const change = dir === "flat" ? `${vs} ${deltaVerb("flat")}` : `${vs} ${absPctText(pct as number)} ${deltaVerb(dir)}`;
  /* 등락의 달이 가격의 달과 다르면 그 달을 적는다(예: 가격 7월 · 지수 8월) */
  const changeMonth = monthOf(r.changeYm);
  const at = changeMonth && changeMonth !== r.periodLabel ? `${changeMonth} ` : "";
  if (r.changeBasis === "index") return `${r.name} ${when}${avg}은 ${r.price}, ${at}시세 지수는 ${change}.`;
  /* 월 집계 카드의 변동률은 평균 거래가가 아니라 **평당가 평균**의 전월비다(DB refresh_market_region_monthly —
     두 달 모두 10건 이상일 때만 값이 있다). "평균이 32.5억, 2.4% 올랐어요"는 32.5억이 2.4% 오른 것으로 읽힌다 */
  if (r.changeBasis === "avg") return `${r.name} ${when}${avg}은 ${r.price}, ${at}평당가는 ${change}.`;
  return dir === "flat"
    ? `${r.name} ${when}${avg}은 ${r.price}, ${change}.`
    : `${r.name} ${when}${avg}이 ${r.price}, ${change}.`;
}

/**
 * [1009 · H 리뷰] "오늘의 한 줄" 거래 문장 — 건수의 **실제 달과 원천**으로만. 없으면 null(슬라이드를 만들지 않는다).
 * 왜: 스냅샷 카드의 거래 건수(남양주 2,646건)는 카드 기준월(8월)이 아니라 부동산원 거래량의 7월 값이었는데, 문장이
 * 카드 기준월을 붙여 "남양주 8월 아파트 매매 2,646건이 신고됐어요"라고 했다. 국토부 월 집계는 **계약월** 기준이다.
 */
export function todayTradeSentence(r: KpiRegion): string | null {
  if (!r.tradeLabel) return null;
  const m = monthOf(r.tradesYm);
  if (m && r.tradesSource === "molit") return `${r.name} ${m} 계약 아파트 매매 ${r.tradeLabel}이 신고됐어요.`;
  if (m && r.tradesSource === "reb") return `${r.name} ${m} 아파트 매매 거래는 ${r.tradeLabel}이에요(한국부동산원 집계).`;
  return `${r.name} 최근 아파트 매매 ${r.tradeLabel}이 신고됐어요.`;
}
