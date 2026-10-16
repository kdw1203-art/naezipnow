import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getRegionSnapshot } from "@/lib/market/store";
import { findCatalogRegionById } from "@/lib/region/catalog";

/* [1066 · 진짜 404] 없는 지역이 HTTP 200 으로 나가던 자리. 이유·실측은
   app/complex/[id]/layout.tsx 주석 참고.
   판단은 본문과 **같은 두 줄**이다(page.tsx): 부동산원 통계가 없어도 카탈로그에 있으면 있는 지역이다
   (2026-07 신설 구는 통계가 아직 없다). 둘 다 없을 때만 404.
   getRegionSnapshot 의 조회 실패는 던진다 → 5xx. "지금 못 준다"를 404 로 바꾸지 않는다. */
const missing = cache(async (id: string) => {
  const snapshot = await getRegionSnapshot(id);
  return !snapshot && !findCatalogRegionById(id);
});

export default async function RegionIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (await missing(decodeURIComponent(id))) notFound();
  return <>{children}</>;
}
