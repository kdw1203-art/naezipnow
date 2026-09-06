import { notFound, redirect } from "next/navigation";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { NoteForm, type NoteFormInitialNote } from "../../new/NoteForm";

/* 임장노트 수정 — 작성 폼(NoteForm) 재사용. 소유자만 접근, 저장은 PATCH.
   비소유자에게는 존재 여부를 숨기기 위해 404 로 응답한다. */

export const dynamic = "force-dynamic";

export const metadata = {
  /* [970 · C-25] 제목 접미 통일 `| 내집나우` */
  title: "임장노트 수정 | 내집나우",
  robots: { index: false, follow: false },
};

export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();

  /* 조회 실패를 notFound() 로 바꾸면 "삭제된 노트"라고 단정하는 셈이다.
     자기 글을 고치러 온 사람에게 그 화면을 보여주면 안 된다 — 던져서 5xx 가
     되게 두고, 사용자는 새로고침으로 되돌아올 수 있게 한다. */
  /* [970 · B-13] 비로그인은 404 가 아니라 로그인으로 — 세션이 끊긴 채 "수정"을 누른
     소유자에게 "없는 노트"라고 답하고 있었다. 비소유자만 존재를 숨긴다(404). */
  if (!email) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/notes/${id}/edit`)}`);
  }
  const note = await getNote(id);
  if (!note) notFound();
  if (note.authorEmail.toLowerCase() !== email) notFound();

  const initial: NoteFormInitialNote = {
    id: note.id,
    title: note.title,
    region: note.region,
    aptName: note.aptName ?? null,
    visitDate: note.visitDate,
    weather: note.weather ?? null,
    summary: note.summary ?? null,
    scores: note.scores,
    checklist: note.checklist,
    sections: {
      pros: note.sections.pros,
      cons: note.sections.cons,
      memo: note.sections.memo,
    },
    photos: note.photos,
    isPublic: note.isPublic,
    metadata: (note.metadata ?? null) as Record<string, unknown> | null,
    /* [967 · 10] 수정 초안 복원 판정 기준 — 이보다 나중에 적힌 초안만 묻는다 */
    updatedAt: note.updatedAt ?? null,
  };

  return <NoteForm initialNote={initial} />;
}
