import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { findCatalogRegionById } from "@/lib/region/catalog";

/* [1066 · 진짜 404] 없는 지역이 HTTP 200 으로 나가던 자리. 이유·실측은
   app/complex/[id]/layout.tsx 주석 참고(레이아웃은 loading 경계 밖이라 404 가 산다).
   여기 확인은 메모리 안 카탈로그 한 번 — 조회 비용 0. 본문의 같은 판단(page.tsx)은 그대로 둔다. */
export default async function RentRegionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ region: string }>;
}) {
  const { region } = await params;
  if (!findCatalogRegionById(decodeURIComponent(region))) notFound();
  return <>{children}</>;
}
