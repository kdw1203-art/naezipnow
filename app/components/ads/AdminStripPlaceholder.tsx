"use client";

import type { AdPlacement } from "@/lib/ads/adsense-policy";

/**
 * [1098 · 배너] 띠 배너 자리 표시 — 관리자에게만 보이던 "띠 배너 없음 · 배너 등록 ›" 한 줄.
 * [1211] 소유자 캡처마다 이 줄이 본문 사이(폰 · PC)에 끼어 화면에서 걷었다 — 등록은 관리자 화면(/admin/banners)에서.
 * 부르는 쪽(띠 배너 자리)의 계약은 그대로 두고 아무것도 그리지 않는다(세션 조회도 하지 않는다).
 */
export function AdminStripPlaceholder(_props: { placement: AdPlacement; className?: string }) {
  return null;
}

export default AdminStripPlaceholder;
