import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";

/* [1090 · 비용] 동네이야기 구역의 셸(헤더 · 옆 메뉴 · 푸터 · 탭바)은 여기 한 벌 — page · loading 은 안쪽만 그린다.
   왜: app/town/loading.tsx 가 /town/* 전부를 감싸는 로딩 경계인데, 그 스켈레톤이 PageShell 을 통째로 그려서 ISR 로 저장되는
   모든 /town/* HTML(뉴스 상세 1,400여 쪽 · 동네 홈 109쪽 …)에 셸이 두 벌(본문 + 대체 조각 31KB) · RSC 에도 두 벌 실렸다
   (1087 의 단지 화면과 같은 현상). 셸이 레이아웃에 있으면 화면 안 이동 때 헤더가 그대로 남고 안쪽만 스켈레톤이 된다.
   폭: 동네 화면은 넓은 벌(wide)과 보통 벌이 섞여 있다 — 레이아웃은 wide 한 벌이고, 보통 폭 화면은 본문을 ShellNarrow 에 담아
   예전과 같은 폭(1200px)이 된다. 경로 줄은 ShellBreadcrumb(PageShell 의 breadcrumb 과 같은 마크업). 모임 채팅(groups/[id]/chat)은
   화면을 통째로 덮는 전용 화면이라 셸 위에 고정 판으로 선다(그 파일 주석). */
export default function TownLayout({ children }: { children: ReactNode }) {
  return <PageShell wide>{children}</PageShell>;
}
