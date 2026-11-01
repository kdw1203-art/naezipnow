import type { ReactNode } from "react";
import { PageShell } from "@/app/components/PageShell";

/* [1093 · 개편] 공개 임장노트 허브의 셸은 여기 한 벌 — 전에는 클라이언트 조각(NotesFeedClient)이 PageShell 을 통째로 그려 헤더 · 옆 메뉴 · 푸터가
   클라이언트 번들 · 수화 대상이었고, 화면 안 이동 때 다시 그려졌다(1087 · 1090 · 1092 와 같은 구조로). (index) 그룹 안에만 — 노트 상세 ·
   이달의 노트 등 형제 화면은 제 셸 그대로. */
export default function NotesIndexLayout({ children }: { children: ReactNode }) {
  return <PageShell>{children}</PageShell>;
}
