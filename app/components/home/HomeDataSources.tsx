import type { HomeBriefing, HomeRegionCard } from "@/lib/newui/home-data";

/* ============================================================
   [v4 · 규칙 3] 홈 맨 끝 — `<details>` "데이터 출처" 하나(단지 상세 ComplexDataSources 와 같은 모양). 서버 조각, JS 없음.

   예전엔 같은 성격의 글이 화면 곳곳에 따로 있었다: 지역 카드마다 "선 · 16주 시세 지수"·"지수 전월 대비"·"부동산원"
   캡션, AI 패널의 브리핑 기준 줄("한국부동산원 월간 매매가격지수 · 구별 전월비의 단순 평균(…)"), 노트 머리의 "임장 점수 ⓘ"
   설명 시트, 노트 목록 아래 "Lab 데이터 노트는 …" 문장, 뉴스룸 머리의 "자동 수집" 표기. 값은 행에 남기고
   **출처·기준·계산법**만 여기 한 곳에 접어 둔다. 화면이 실제로 보여 준 자료의 줄만 그린다(값이 없던 줄은 없다).
   ============================================================ */

export function HomeDataSources({
  regions,
  briefing,
  hasCoverage,
  hasTemp,
  hasRate,
  loanRateAsOf,
  hasNotes,
  hasLabNotes,
  hasNews,
}: {
  regions: HomeRegionCard[];
  briefing: HomeBriefing | null;
  hasCoverage: boolean;
  hasTemp: boolean;
  hasRate: boolean;
  loanRateAsOf: string | null;
  hasNotes: boolean;
  hasLabNotes: boolean;
  hasNews: boolean;
}) {
  const rows: Array<{ label: string; text: string }> = [];
  if (hasCoverage) rows.push({ label: "실거래", text: "국토교통부 실거래 신고분(매매·전월세) · 해제 건 제외" });
  if (regions.length > 0) {
    const price = [
      regions.some((r) => !r.stale) ? "한국부동산원 평균 매매가" : null,
      regions.some((r) => r.stale) ? "국토교통부 실거래 평균(월 집계)" : null,
    ].filter(Boolean);
    const change = [
      regions.some((r) => r.changeBasis === "index") ? "한국부동산원 매매가격지수 전월 대비" : null,
      regions.some((r) => r.changeBasis === "avg") ? "국토교통부 실거래 평당가 평균 전월 대비" : null,
    ].filter(Boolean);
    const trades = [
      regions.some((r) => r.tradesSource === "reb") ? "한국부동산원 월간 거래량" : null,
      regions.some((r) => r.tradesSource === "molit") ? "국토교통부 실거래(계약월)" : null,
    ].filter(Boolean);
    rows.push({ label: "지역 동향 가격", text: price.join(" · ") });
    if (change.length) rows.push({ label: "지역 동향 등락", text: change.join(" · ") });
    if (trades.length) rows.push({ label: "지역 동향 거래", text: `${trades.join(" · ")} — 건수 옆 괄호는 그 건수의 달` });
  }
  if (briefing) rows.push({ label: "서울 상승 구 수", text: `${briefing.basis} · ${briefing.asOfLabel}` });
  if (hasTemp) rows.push({ label: "시장 온도", text: "매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이로 계산한 0~100 · 주 1회 기록" });
  if (hasRate) {
    rows.push({
      label: "금리",
      text: `기준금리 한국은행 · 주담대 은행권 변동금리 하단 금융감독원 금융상품 공시${loanRateAsOf ? `(${loanRateAsOf})` : ""}`,
    });
  }
  if (hasNotes) {
    rows.push({
      label: "임장 점수",
      text: "작성자가 매긴 입지·학군·교통·시설·미래가치(각 5점) 중 매긴 항목 평균 × 20 · 같은 단지도 쓴 사람·시점마다 다름",
    });
  }
  if (hasLabNotes) rows.push({ label: "내집나우 Lab", text: "실거래·통계로 편집부가 정리한 노트 — 이웃이 다녀와 쓴 노트와 함께 싣는다" });
  if (hasNews) rows.push({ label: "뉴스", text: "언론사 부동산 기사 자동 수집(뉴스룸)" });
  if (rows.length === 0) return null;

  return (
    <details className="group border-t border-line pt-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
        데이터 출처
        <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <dl className="flex flex-col gap-1.5 pb-3 pt-1">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <dt className="t-sub font-bold text-text-2">{r.label}</dt>
            <dd className="t-caption text-text-3">{r.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
