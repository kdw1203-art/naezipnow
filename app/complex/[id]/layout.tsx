import { cache, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { getComplexBaseById } from "@/lib/complex/complex-store";
import { pureIdFromParam } from "@/lib/seo/complex-slug";
import { PageShell } from "../../components/PageShell";

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
  /* [1087 · 비용] 셸(헤더·옆 메뉴·푸터·탭바)은 여기 한 번 — page 와 loading 은 셸 **안쪽**만 그린다.
     예전엔 page 와 loading 이 각자 PageShell 을 그려, ISR 로 저장되는 HTML 에 로딩 스켈레톤용 셸이 통째로 한 벌 더 들어갔다
     (스트리밍 대체 조각 · 운영 실측 45KB = 헤더 12.9KB · 푸터 6KB … · RSC 에도 푸터 2벌). 단지 화면은 사이트에서 가장 많이
     렌더되는 ISR 페이지(2.4만 곳)라 그 한 벌이 ISR 쓰기·오리진 전송 비용으로 그대로 나갔다. 셸이 경계 밖으로 나오면
     클라이언트 이동 때도 헤더가 그대로 있고 안쪽만 스켈레톤으로 바뀐다. */
  return <PageShell>{children}</PageShell>;
}
