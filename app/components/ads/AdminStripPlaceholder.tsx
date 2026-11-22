"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { getSessionLite } from "@/lib/client/session-lite";
import type { AdPlacement } from "@/lib/ads/adsense-policy";

/**
 * [1098 · 배너] 띠 배너 자리 표시 — **관리자에게만**. 등록된 띠 배너가 없을 때 일반 방문자에게는 아무것도 그리지 않는다(빈 상자 금지).
 * 관리자는 세션(role=admin)을 읽은 뒤에만 점선 자리와 등록 링크를 본다 — 판정 전엔 null 이라 다른 사람에게 깜박이지 않는다.
 */
const PLACEMENT_KO: Record<AdPlacement, string> = {
  home_feed: "홈",
  community_feed: "동네",
  report_free_body: "리포트",
  article_end: "기사",
  page_bottom: "허브",
  sidebar: "레일",
};

export function AdminStripPlaceholder({ placement, className = "" }: { placement: AdPlacement; className?: string }) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    getSessionLite().then((s) => {
      if (alive && (s?.user?.role ?? "") === "admin") setAdmin(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!admin) return null;
  return (
    /* [1204 · 정리정돈] 소유자 2026-11-21 "여기도 정리정돈" — 점선 큰 상자(높이 약 70px)를 오른쪽 끝 한 줄 글자로. 관리자에게만 보인다 */
    /* [1210 · 42] 폰에서는 숨긴다 — 좁은 화면에서 본문 사이 한 줄이 매 화면 끼었다(캡처마다). 등록은 PC · 관리자 화면에서 */
    <aside className={`flex justify-end max-md:!hidden ${className}`} aria-label="광고 배너 자리" data-placement={placement}>
      <p className="m-0 t-caption text-text-3">
        띠 배너 없음({PLACEMENT_KO[placement]}) ·{" "}
        <Link href="/admin/banners" className="tap-line font-bold text-primary no-underline">
          배너 등록 ›
        </Link>
      </p>
    </aside>
  );
}

export default AdminStripPlaceholder;
