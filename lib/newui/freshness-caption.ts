/**
 * [1007 · P2] 실거래 신선도 한 줄 — 순수 함수(테스트 가능, server-only 없음).
 *
 * 왜: 단지 허브는 "실거래 기준: 2026.09.19 (국토교통부)" 를 적고 지역 허브는 같은 값을
 * JSON-LD dateModified 에만 넣고 화면에는 안 적었다. 두 허브가 같은 원천
 * (market_ingest_log 마지막 성공 적재, getMarketFreshnessDateLabel) 을 같은 문장으로 말한다.
 * 문장에 **신고 지연**을 같이 적는 이유: 적재일이 오늘이어도 최근 30일 계약은 아직
 * 신고되지 않았을 수 있다 — 적재일만 적으면 "오늘 것까지 다 있다" 로 읽힌다.
 */
import { freshnessLabelToIsoDate } from "@/lib/seo/citable-summary";

/** 국토교통부 실거래 신고 기한 — 계약 후 30일(부동산거래신고법) */
export const REPORT_LAG_DAYS = 30;

/**
 * "2026.09.19" → "실거래 마지막 반영 2026-09-19 · 신고 지연 최대 30일".
 * 라벨이 없거나 달력에 없는 날이면 null — 화면은 그 줄을 뺀다(추정 날짜를 만들지 않는다).
 */
export function marketFreshnessCaption(label: string | null | undefined): string | null {
  const iso = freshnessLabelToIsoDate(label);
  if (!iso) return null;
  return `실거래 마지막 반영 ${iso} · 신고 지연 최대 ${REPORT_LAG_DAYS}일`;
}
