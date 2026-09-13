import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTemplate } from "@/lib/note-templates/store";
import { getNote } from "@/lib/inspection/store-db";
import { buildRevisitPrefill, type RevisitPrefill } from "@/lib/inspection/revisit-prefill";
import { safeAuth } from "@/lib/safe-auth";
import { NoteForm, type NoteFormTemplate } from "./NoteForm";

/* 임장노트 작성 — 폼 본체는 NoteForm(클라이언트, /notes/[id]/edit 와 공용).
   ?tpl={id} 로 도착하면 서버에서 템플릿을 읽어 체크리스트 프리셋으로 전달한다.
   ?memo= 로 도착하면 메모 초안으로 프리필한다(/calculator "임장노트에 저장" 연결).
   [995 · 3] ?revisit={noteId} 로 도착하면 **내** 이전 노트를 읽어 회차 프리필로
   전달한다(revisitOf — initialNote 가 아니므로 폼은 작성 모드 그대로다). */

export const dynamic = "force-dynamic";

/* N7 — 작성 폼은 색인 대상이 아니다. ?tpl=·?memo= 로 만들어지는 URL 은 특정
   사용자의 일회용 진입 주소이고(메모 초안이 주소에 실리기도 한다), 검색에서
   들어와도 로그인 벽을 만난다. follow 는 남겨 내부 링크는 그대로 타게 둔다. */
export const metadata: Metadata = {
  title: "임장노트 작성 | 내집나우",
  robots: { index: false, follow: true },
};

/* [995 · 3] uuid 모양만 조회한다 — getNote 도 같은 판정을 하지만, 여기서 걸러야
   로그인 리다이렉트까지 가지 않는다(봇·오타 링크에 로그인 벽을 세울 이유가 없다). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NoteNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const tplId = typeof sp.tpl === "string" ? sp.tpl.trim() : "";
  const presetMemo =
    typeof sp.memo === "string" && sp.memo.trim() ? sp.memo.trim().slice(0, 2000) : null;
  const preferAi =
    typeof sp.intent === "string" && sp.intent.trim().toLowerCase() === "ai";
  const fromWelcome =
    typeof sp.from === "string" && sp.from.trim().toLowerCase() === "welcome";
  /* [#68] 현장 퀵모드 — ?quick=1: 사진·위치·메모만 먼저, 세부 항목은 접힘 */
  const quickStart = typeof sp.quick === "string" && sp.quick.trim() === "1";
  let template: NoteFormTemplate | null = null;
  if (tplId) {
    try {
      const t = await getTemplate(tplId);
      if (t) template = { id: t.id, title: t.title, sections: t.sections };
    } catch {
      /* 템플릿 조회 실패 — 템플릿 없이 일반 작성으로 진행 */
    }
  }

  /* [995 · 3] 회차 프리필. 비로그인은 로그인으로(돌아올 주소에 revisit 을 남긴다).
     없는 노트·남의 노트·조회 실패는 **조용히** 일반 작성으로 — 재방문하러 온
     사람에게 404 를 보여줄 이유가 없고, 남의 노트는 존재도 알리지 않는다.
     무엇을 잇고 무엇을 새로 적는지는 lib/inspection/revisit-prefill(순수·테스트)이
     여기서 끝내고, 폼에는 결과(RevisitPrefill)만 넘긴다 — 폼 초기 번들에 판단
     코드를 더하지 않는다(/notes/new 예산 여유가 1~2KB 다). */
  let revisitOf: RevisitPrefill | null = null;
  const revisitId = typeof sp.revisit === "string" ? sp.revisit.trim() : "";
  if (revisitId && UUID_RE.test(revisitId)) {
    const session = await safeAuth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (!email) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/notes/new?revisit=${revisitId}`)}`);
    }
    try {
      const note = await getNote(revisitId);
      if (note && note.authorEmail.trim().toLowerCase() === email) {
        /* 방문일 기본값은 폼이 기기 달력으로 다시 정한다 — 서버 시각(UTC)이 아니라 */
        revisitOf = buildRevisitPrefill(
          {
            id: note.id,
            region: note.region,
            aptName: note.aptName ?? null,
            visitDate: note.visitDate,
            scores: note.scores,
            checklist: note.checklist,
            sections: {
              pros: note.sections.pros,
              cons: note.sections.cons,
              memo: note.sections.memo,
            },
            metadata: (note.metadata ?? null) as Record<string, unknown> | null,
          },
          new Date().toISOString().slice(0, 10),
        );
      }
    } catch {
      /* 조회 실패 — 프리필 없이 일반 작성. 폼은 그대로 쓸 수 있다 */
    }
  }

  return (
    <NoteForm
      template={template}
      presetMemo={presetMemo}
      preferAi={preferAi || fromWelcome}
      fromWelcome={fromWelcome}
      quickStart={quickStart}
      revisitOf={revisitOf}
    />
  );
}
