import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getComplexBaseById } from "@/lib/complex/complex-store";
import { pureIdFromParam } from "@/lib/seo/complex-slug";

/* [1066 · 진짜 404] 없는 단지가 HTTP 200 으로 나가던 자리(소프트 404).
 *
 * 왜 레이아웃인가 — 2026-10-13 탐침 네 벌로 실측했다(app/zz-probe, 측정 뒤 지웠다):
 *   ① 자기 세그먼트 loading.tsx + **layout** 에서 notFound() → 404
 *   ② 조상 세그먼트 loading.tsx + layout 에서 notFound()     → 200 (조상 경계가 삼킨다)
 *   ③ 경계 없음 + page 에서 notFound()                        → 404
 *   ④ 자기 세그먼트 loading.tsx + **page** 에서 notFound()    → 200  ← 종전 상태
 * Next 는 한 세그먼트를 `layout > Suspense(loading) > page` 로 감는다 — page 의 notFound()
 * 는 그 Suspense 안에서 잡혀 상태 코드가 200 으로 굳는다. 레이아웃은 경계 **밖**이라 404 가
 * 그대로 나간다. 그래서 로딩 스켈레톤을 지우지 않고도 404 를 돌려줄 수 있다.
 *
 * 비용: 존재 확인 한 번(대표행 조회). 이 라우트는 ISR(revalidate 1주)이라 캐시 미스에만 돈다.
 * React cache() 로 묶어 같은 요청 안에서 두 번 조회되지 않게 한다.
 * 조회 **실패**는 던진다(5xx) — null 은 "정말 없는 단지"일 때만 돌아온다(getComplexBaseById 주석). */
const exists = cache(async (id: string) => (await getComplexBaseById(id)) !== null);

export default async function ComplexIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: raw } = await params;
  if (!(await exists(pureIdFromParam(decodeURIComponent(raw))))) notFound();
  return <>{children}</>;
}
