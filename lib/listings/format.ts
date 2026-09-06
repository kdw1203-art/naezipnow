/**
 * 가격 표기 포맷터 (순수 함수 — 데이터 소스 없음).
 *
 * 사실 우선: 원래 이 두 함수는 `lib/listings/filter.ts` 안에 있었고, 그 파일은
 * `lib/listings/sample-data.ts`(허구 매물 생성기)를 import 하고 있었다.
 * 실제로 프로덕션에 닿는 건 이 포맷터 두 개뿐이라 여기로 분리하고
 * 생성기·필터 모듈은 삭제했다. 자세한 사유는 커밋 메시지 참고.
 */

import { formatKrwWon } from "@/lib/format/krw";

/** 가격(원)을 억/만 라벨로 — 예: 12.5억, 8.0억, 8,500만
 *  [967 · 31] 본체는 lib/format/krw.ts "listing" 스타일(10억 미만은 소수 한 자리 고정 —
 *  실거래 요약의 "short" 와 달리 "8.0억" 을 "8억" 으로 줄이지 않는다. 매물 화면의 기존 얼굴) */
export function formatPriceKrw(won: number): string {
  return formatKrwWon(won, { style: "listing" });
}

/** 월세 표기 — 보증금/월 (예: 5,000만/85만) */
export function formatRentLabel(deposit: number, monthly: number): string {
  return `${formatPriceKrw(deposit)}/${formatPriceKrw(monthly)}`;
}
