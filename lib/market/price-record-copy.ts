/**
 * [1027] 신고가 자동 소식의 글 — 순수 함수(tests/unit/facts-1027.test.ts).
 * 발행(lib/market/price-record-watch.ts)은 server-only 라 테스트가 못 읽는다. 글을 만드는 부분만 여기 둔다.
 */
import { regionIdForName } from "@/lib/region/catalog";
import { formatKrwWon } from "@/lib/format/krw";

export type PriceHighRow = {
  complex_name: string;
  region_name: string;
  area: number;
  deal_amount_krw: number;
  prior_max: number;
  prior_n: number;
  contract_ym: string;
  contract_day: number | null;
};

/** [967 · 31] "8.40억" — 뒤 0 을 지우지 않는 신고가 알림 얼굴. 본체는 lib/format/krw.ts */
function krwEok(v: number): string {
  return formatKrwWon(v, { style: "eok", below: "eok", empty: false, trimZeros: false });
}

/**
 * 전용면적을 평으로 — "전용 26평". [1027] 예전에는 "26평형"이라 적었다. 시장에서 "○○평형"은 공급면적 기준이라
 * (전용 85㎡ = 34평형) 전용 85㎡ 를 "26평형"이라 하면 한 체급 작은 집으로 읽힌다. 이 값은 전용면적 ÷ 3.3 이므로 그렇게 적는다.
 */
function pyeong(area: number): string {
  return `전용 ${Math.round(area / 3.305785)}평`;
}

/** RPC(detect_new_price_highs)의 비교 하한과 같은 달 — to_char(now() - interval '3 years', 'YYYYMM') */
export function threeYearsAgoYm(now: Date = new Date()): string {
  const y = now.getUTCFullYear() - 3;
  const m = now.getUTCMonth() + 1;
  return `${y}${String(m).padStart(2, "0")}`;
}

/**
 * 비교 구간을 말로. 그 단지·면적대 이력의 첫 달이 3년 하한보다 같거나 이르면 3년을 덮은 것이라
 * "직전 3년", 아니면 가진 이력의 첫 달("2025.01 이후"). 첫 달을 모르면 "수집 기간".
 */
export function priorWindowLabel(firstYm: string | null | undefined, now: Date = new Date()): string {
  if (!firstYm || !/^\d{6}$/.test(firstYm)) return "수집 기간";
  if (firstYm <= threeYearsAgoYm(now)) return "직전 3년";
  return `${firstYm.slice(0, 4)}.${firstYm.slice(4)} 이후`;
}

/** 글 본문·요약 — 숫자는 RPC 결과 그대로, 비교 구간은 줄마다(windows[i]) */
export function priceHighCopy(input: {
  dateLabel: string;
  items: PriceHighRow[];
  windows: string[];
}): { title: string; content: string; aiSummary: string } {
  const { dateLabel, items, windows } = input;
  const top = items[0];
  const title = `오늘의 신고가 — ${top.complex_name} ${pyeong(top.area)} ${krwEok(top.deal_amount_krw)} 등 ${items.length}건`;
  const lines = items.map((r, i) => {
    const pct = ((r.deal_amount_krw / r.prior_max - 1) * 100).toFixed(1);
    const rid = regionIdForName(r.region_name);
    const regionLink = rid ? ` → 지역 시세: naezipnow.com/region/${rid}` : "";
    return `· ${r.region_name} ${r.complex_name} ${r.area}㎡(${pyeong(r.area)}) — ${krwEok(
      r.deal_amount_krw,
    )} 신고 (${windows[i] ?? "수집 기간"} 최고 ${krwEok(r.prior_max)} 대비 +${pct}%, 비교 표본 ${r.prior_n}건)${regionLink}`;
  });
  const content = [
    `${dateLabel} 국토교통부 실거래 신고분에서 이전 최고가를 넘긴 계약 ${items.length}건이 확인됐습니다.`,
    "",
    ...lines,
    "",
    "기준: 같은 단지·비슷한 면적(±2㎡)의 앞선 신고가와 비교했습니다(내집나우가 수집한 기간 안 · 최대 3년, 비교 구간은 줄마다 괄호 안). 비교 표본이 10건 이상인 경우만 담았습니다. 실거래 신고는 계약 후 30일 이내에 이뤄지며, 신고 취소·정정으로 값이 바뀔 수 있습니다.",
  ].join("\n");
  const aiSummary = `${dateLabel} 실거래 신고분 중 이전 최고가 경신 ${items.length}건 — 최고가는 ${top.complex_name} ${krwEok(top.deal_amount_krw)}입니다.`;
  return { title, content, aiSummary };
}
