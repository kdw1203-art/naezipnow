import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadNote } from "./load-note";

/* [1066 · 진짜 404] 없는 노트가 HTTP 200 으로 나가던 자리. 이유·실측은
   app/complex/[id]/layout.tsx 주석 참고(레이아웃은 loading 경계 밖이라 404 가 산다).
   여기서 거르는 것은 **없는 노트 한 가지**다 — 비공개·구매 열람 판단은 보는 사람에 따라
   갈리므로 본문(page.tsx)에 그대로 둔다. loadNote 는 본문과 같은 모듈의 cache() 라
   한 요청에 조회는 한 번이다. 조회 실패(kind:"error")는 404 가 아니다 — 본문이 처리한다. */
export default async function NoteIdLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if ((await loadNote(id)).kind === "missing") notFound();
  return <>{children}</>;
}
