import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";

/* [1092 · 비용] 실매물 구역의 셸은 여기 한 벌 — page · loading 은 안쪽만(경로 줄 · 제목은 화면마다 다르므로 ShellBreadcrumb · ShellTitle 로).
   app/listings/loading.tsx 가 /listings/* 전부를 감싸는 로딩 경계라 ISR HTML 에 셸이 두 벌(약 31KB) 실렸다(1090 과 같은 현상). */
export default function ListingsLayout({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
