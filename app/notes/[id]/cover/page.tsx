/* [1026 · 노트 쓰기] 저장 직후 표시 saved=1 을 상세로 넘긴다(doneHref = lib/notes/form-progress coverDoneHref) — 그 밖은 그대로.
 * 임장노트 썸네일 고르기 — /notes/[id]/cover (작성자 본인만).
 *
 * 노트를 저장한 뒤(NoteForm 이 여기로 보낸다) 또는 상세의 "썸네일 바꾸기"에서 온다. 후보 3장은 화면이 열리면
 * 후보 API(AI 문구 + 숫자 검증 + 규칙 채움)로 받고, 그 API 가 실패해도 고를 수 있게 서버가 규칙 후보 3장을
 * 미리 넘긴다. 고른 것은 PUT /api/notes/[id]/cover 로 metadata.cover 에만 저장한다.
 * 비로그인은 로그인으로, 남의 노트는 존재를 숨기려 404(수정 화면과 같은 규칙).
 * `?ai=pending`(저장 직후)은 상세로 돌아갈 때 그대로 넘긴다 — 상세가 AI 정리 대기 상태를 읽는다. */
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { getNote } from "@/lib/inspection/store-db";
import { safeAuth } from "@/lib/safe-auth";
import { composeCandidates, coverPhotoOf } from "@/lib/notes/cover/rules";
import { coverPreviewPath } from "@/lib/notes/cover/preview";
import { regionGroupOf } from "@/lib/notes/region-match";
import { CoverPicker, type CoverCandidate } from "./CoverPicker";
import { coverDoneHref, isSavedFlag } from "@/lib/notes/form-progress";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "썸네일 고르기 | 내집나우",
  robots: { index: false, follow: false },
};

export default async function NoteCoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const aiPending = sp.ai === "pending";
  /* [1026 · 노트 쓰기] 작성 화면이 단 saved=1 을 상세까지 넘긴다 — 상세 첫머리 "저장 완료" 카드의 표시(lib/notes/form-progress) */
  const saved = isSavedFlag(sp.saved);
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    const back = `/notes/${id}/cover${aiPending ? "?ai=pending" : ""}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }
  /* 조회 실패는 던져서 5xx — "없는 노트"라고 단정하지 않는다(수정 화면과 같은 이유) */
  const note = await getNote(id);
  if (!note || note.authorEmail.toLowerCase() !== email) notFound();

  const doneHref = coverDoneHref(id, aiPending, saved);
  const photo = coverPhotoOf(note);
  const fallback: CoverCandidate[] = composeCandidates(note).map((d) => ({
    ...d,
    previewUrl: coverPreviewPath(d, photo),
  }));
  const place = [note.aptName?.trim() || note.title, regionGroupOf(note.region)].filter(Boolean).join(" · ");

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="t-title text-ink">썸네일 고르기</h1>
          {place && <p className="t-sub text-text-3">{place}</p>}
        </div>
        <CoverPicker noteId={id} fallback={fallback} doneHref={doneHref} />
      </div>
    </PageShell>
  );
}
