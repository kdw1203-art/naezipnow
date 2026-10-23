import type { ReactNode } from "react";
import { PageShell } from "../../components/PageShell";

/* [1087 · 비용] 지역별 실거래 구간(/tx/<지역> · /tx/<지역>/<종류>/<구간>)의 셸은 여기 한 번 — 페이지와 로딩 스켈레톤은 셸 **안쪽**만.
   예전엔 둘 다 PageShell 을 그려 ISR 로 저장되는 HTML 에 로딩용 셸(헤더·옆 메뉴·푸터·탭바 · 약 45KB)이 한 벌 더 들어갔다
   (단지 화면과 같은 구조 — app/complex/[id]/layout.tsx). 경로 줄·제목은 페이지가 ShellBreadcrumb·ShellTitle 로 같은 마크업을 그린다. */
export default function TxRegionLayout({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
