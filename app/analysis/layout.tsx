import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";

/* [1090 · 비용] 분석 구역의 셸은 여기 한 벌 — page · loading 은 안쪽만 그린다(app/town/layout.tsx 와 같은 이유 · 1087 단지 화면과 같은 구조).
   app/analysis/loading.tsx 가 /analysis/* 전부(시장 온도 지역 69쪽 · AI 도구 12쪽 · 허브들)를 감싸는 로딩 경계라 셸이 두 벌 저장됐다.
   도구 색(toolScope)을 쓰던 화면은 본문을 `<div className="tool-scope" style={…}>` 에 담는다 — .tool-scope 는 변수 · 자손 규칙뿐이라
   <main> 에 있던 것과 같다. 오류 화면(error.tsx)은 셸 안에 그려지므로 AreaError inShell(main 을 겹치지 않는다). */
export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
