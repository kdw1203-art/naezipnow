"use client";

import { useEffect } from "react";

/** [1080] 매물 조회수 핑 — 마운트 시 1회. 렌더 중 DB 쓰기(크롤러·새로고침까지 전부)를 떼어 사람 조회만 센다.
 *  실패는 조용히 무시(조회수는 best-effort). 개발물건 ViewPing 과 같은 꼴. */
export function ListingViewPing({ listingId }: { listingId: string }) {
  useEffect(() => {
    const url = `/api/listings/${encodeURIComponent(listingId)}/view`;
    try {
      if (navigator.sendBeacon?.(url)) return;
    } catch {
      /* sendBeacon 미지원/차단 → fetch 폴백 */
    }
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }, [listingId]);
  return null;
}

export default ListingViewPing;
