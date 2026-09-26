/**
 * [1009 · T] 매물 가격 표기 — 순수 함수(단위검증: tests/unit/listings-1009.test.ts).
 *
 * 왜(2026-09-22 실측): 매물 목록·상세·비교함·비교 표가 호가를 "28.6억"·"9,800만"(억 소수 한 자리)으로 줄여 적었다
 * (lib/market/format formatKrwShort — 화면마다 사본 3개). 매물 한 건의 호가는 사이트 표준으로 **정밀 표기**다
 * ("12억 4,500만" — 네이버 부동산 목록 관례, lib/format/eok-man). 28억 6,000만과 28억 5,500만이 같은 "28.6억"으로 보이면
 * 두 매물을 비교할 수 없다. 평균·중위가 같은 요약값만 짧은 표기를 쓰고, 그때는 "중위가"라고 적는다.
 *
 * "시세 대비" → "실거래 대비": 비교 기준은 같은 단지·면적대 국토부 실거래(매매) 중위가다(lib/listings/price-compare) —
 * 실거래만 있는 자리에서 "시세"라고 부르지 않는다(1009 표기 표준).
 */
import { formatEokMan } from "@/lib/format/eok-man";
import { DELTA_BADGE_CLASS, DELTA_CLASS, type DeltaDir } from "@/lib/format/delta";

type PriceFields = {
  listingType: "sale" | "jeonse" | "monthly";
  priceKrw: number | null;
  depositKrw: number | null;
  monthlyKrw: number | null;
};

/** 원 → "12억 4,500만" · 값이 없으면 "—" */
export function krwText(krw: number | null | undefined): string {
  if (krw == null || !Number.isFinite(krw) || krw <= 0) return "—";
  return formatEokMan(krw / 10_000);
}

/** "매매 12억 4,500만" · "전세 6억" · "월세 1억 / 120만" */
export function listingPriceLine(l: PriceFields): string {
  if (l.listingType === "sale") return `매매 ${krwText(l.priceKrw)}`;
  if (l.listingType === "jeonse") return `전세 ${krwText(l.depositKrw)}`;
  return `월세 ${krwText(l.depositKrw)} / ${krwText(l.monthlyKrw)}`;
}

/** 이 폭(%) 안이면 "실거래 수준" — lib/listings/price-compare 의 배지가 쓰던 ±3% 그대로 */
export const MARKET_FLAT_PCT = 3;

export type MarketCompare = {
  dir: DeltaDir;
  /** 배지 글 — "▲ 5%" · "▼ 8%" · "실거래 수준" */
  label: string;
  /** 결론 한 줄 — "최근 실거래 중위가보다 5% 높아요" */
  sentence: string;
  /** 배지 클래스(등락 토큰 — 상승 빨강 ▲ · 하락 파랑 ▼ · 보합 회색) */
  badgeClass: string;
  /** 글자 클래스 */
  textClass: string;
};

/** 호가 − 최근 실거래 중위가 비율(%, 정수) → 배지·문장. 값이 없으면 null(지어내지 않는다) */
export function marketCompare(deltaPct: number | null | undefined): MarketCompare | null {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return null;
  const abs = Math.abs(Math.round(deltaPct));
  const dir: DeltaDir = Math.abs(deltaPct) < MARKET_FLAT_PCT ? "flat" : deltaPct > 0 ? "up" : "down";
  const label = dir === "flat" ? "실거래 수준" : `${dir === "up" ? "▲" : "▼"} ${abs}%`;
  const sentence =
    dir === "flat"
      ? `최근 실거래 중위가와 비슷해요(±${MARKET_FLAT_PCT}% 안)`
      : `최근 실거래 중위가보다 ${abs}% ${dir === "up" ? "높아요" : "낮아요"}`;
  return { dir, label, sentence, badgeClass: `delta ${DELTA_CLASS[dir]} ${DELTA_BADGE_CLASS[dir]}`, textClass: DELTA_CLASS[dir] };
}
