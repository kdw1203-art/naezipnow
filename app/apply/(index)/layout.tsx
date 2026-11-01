import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";
import { townBreadcrumb } from "@/lib/town/category-links";

/* [1092 · 비용] 이 화면의 셸은 여기 한 벌 — page · loading 은 안쪽만 그린다(1087 · 1090 과 같은 구조). (index) 그룹 안에만 두어
   형제 화면(다른 폭 · 다른 경로 줄)은 제 셸 그대로다. loading.tsx 가 PageShell 을 통째로 그리면 ISR HTML 에 셸이 두 벌(약 31KB) 실리고
   화면 안 이동 때 헤더가 한 번 더 그려졌다. */
export default function Layout({ children }: { children: ReactNode }) {
  return <PageShell breadcrumb={townBreadcrumb("/apply")} wide>{children}</PageShell>;
}
