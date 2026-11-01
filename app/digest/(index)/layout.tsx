import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";

/* [1092 · 비용] 이 구역의 셸(헤더 · 옆 메뉴 · 푸터 · 탭바)은 여기 한 벌 — page · loading 은 안쪽만 그린다(1087 단지 · 1090 동네이야기 · 분석과 같은 구조).
   loading.tsx 가 PageShell 을 통째로 그리면 React 가 큰 Suspense 경계(12.8KB 초과)를 "대체 조각 + 본문" 으로 내보내 ISR HTML 에 셸이
   두 벌(약 31KB) 실리고, 화면 안 이동 때 헤더가 한 번 더 그려졌다. 경로 줄은 본문 것(뉴스룸 › 주간 다이제스트) — 로딩 스켈레톤의 옛 문구(주간 다이제스트)는 이제 없다. */
export default function Layout({ children }: { children: ReactNode }) {
  return <PageShell breadcrumb="뉴스룸 › 주간 다이제스트">{children}</PageShell>;
}
