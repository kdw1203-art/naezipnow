"use client";

import { usePathname } from "next/navigation";
import { isAdsExcludedPath } from "@/lib/ads/adsense-policy";

/* [1124 · 좌우 광고 띠] 제외 경로(결제 · 내 정보 · 로그인 …)와 관리자 화면에는 띠 자체를 그리지 않는다 —
   안쪽 대체 카드(AdSlot)는 서버에서 그려지므로 경로 판정은 여기(클라이언트)서 한 번 더 한다. */
export function SideRailGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (isAdsExcludedPath(pathname) || pathname === "/admin" || pathname.startsWith("/admin/")) return null;
  return <>{children}</>;
}

export default SideRailGate;
