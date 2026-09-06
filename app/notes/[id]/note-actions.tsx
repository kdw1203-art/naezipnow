"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "../../components/toast/ToastProvider";
import { ShareLinkButton } from "../../components/ShareLinkButton";

/* 노트 상세 실동작 액션 (더미 버튼 제거)
   - 공유(#바이럴 회로, 전략 정본 §5): 모바일은 OS 공유 시트(카카오톡·문자로
     바로), 데스크톱은 클립보드. 링크에 utm_source=share 를 실어 어드민
     트래픽의 기존 UTM 집계로 "공유 유입"이 그대로 잡히게 한다.
     비공개 노트는 복사부터 막는다 — 받은 사람이 못 여는 링크는 바이럴이
     아니라 신뢰 소모라서, 공개 전환을 먼저 안내한다.
     [966] 시트→클립보드→토스트 순서는 공용 ShareLinkButton 이 맡는다 — 여기는
     비공개 가드와 utm 붙은 주소만 정한다.
   - 소유자: 수정(/notes/[id]/edit) + 공개/비공개 토글 — PATCH /api/inspection/notes/[id]
   - [967 · 3] 소유자: 삭제 — DELETE /api/inspection/notes/[id](이미 있던 핸들러, 소유자만).
     화면에 삭제 버튼이 없어 API 만 살아 있었다. window.confirm 대신 같은 자리에서
     2단계 인라인 확인 — 되돌릴 수 없는 일이라 문구에 그 사실을 적는다. */

export function NoteDetailActions({
  noteId,
  isOwner,
  initialIsPublic,
}: {
  noteId: string;
  isOwner: boolean;
  initialIsPublic: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [busy, setBusy] = useState(false);
  /* [967 · 3] 삭제 확인 단계 — 첫 탭은 확인 문구만 연다 */
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteNote = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}`, { method: "DELETE" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        showToast("삭제에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      showToast("노트를 삭제했어요");
      router.push("/notes");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setDeleting(false);
    }
  };

  /* 상대 경로 — ShareLinkButton 이 누를 때 현재 origin 으로 푼다(SSR 에서 window 불필요) */
  const shareUrl = `/notes/${encodeURIComponent(noteId)}?utm_source=share&utm_medium=note`;
  const shareClass = "btn-soft px-3.5 py-2 t-body";

  const toggleVisibility = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        showToast("전환에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      const next = !isPublic;
      setIsPublic(next);
      showToast(next ? "공개 노트로 전환했어요" : "비공개로 전환했어요");
      router.refresh();
    } catch {
      showToast("네트워크 오류가 발생했어요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      {/* 나만의 카드 — AI가 기록으로 자동 구성한 카드를 색상·장 선택으로 꾸민다.
          소유자는 '만들기', 공개 노트 열람자는 '카드 보기'. */}
      <Link
        href={`/notes/${noteId}/card`}
        className="btn-primary px-3.5 py-2 t-body font-bold no-underline"
      >
        {isOwner ? "🎨 나만의 카드 만들기" : "🎴 카드 보기"}
      </Link>
      {isOwner && (
        <Link
          href={`/notes/${noteId}/edit`}
          className="btn-soft px-3.5 py-2 t-body no-underline"
        >
          수정
        </Link>
      )}
      {isOwner && (
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={busy}
          className="btn-soft px-3.5 py-2 t-body disabled:opacity-60"
        >
          {busy ? "전환 중…" : isPublic ? "비공개로 전환" : "공개로 전환"}
        </button>
      )}
      {isPublic ? (
        <ShareLinkButton
          url={shareUrl}
          label="공유 링크"
          copiedLabel="복사됨 ✓"
          copiedMessage="링크가 복사됐어요 — 붙여넣기만 하면 공유 완료"
          variant="text"
          className={shareClass}
        />
      ) : (
        /* 비공개 — 시트·복사 대신 공개 전환 안내만(받아도 못 여는 링크는 만들지 않는다) */
        <button
          type="button"
          onClick={() =>
            showToast("비공개 노트는 링크를 받아도 볼 수 없어요 — 먼저 공개로 전환해 주세요")
          }
          className={shareClass}
        >
          공유 링크
        </button>
      )}
      {/* [967 · 3] 삭제 — 소유자만. 확인 단계는 버튼 줄 안에서 펼친다(모달·confirm 없이). */}
      {isOwner && !confirmDelete && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="btn-soft px-3.5 py-2 t-body text-danger"
        >
          삭제
        </button>
      )}
      {isOwner && confirmDelete && (
        <div
          role="alertdialog"
          aria-label="노트 삭제 확인"
          className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5"
        >
          <span className="t-body font-bold text-ink">
            이 노트를 삭제할까요? 되돌릴 수 없어요
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void deleteNote()}
              disabled={deleting}
              className="rounded-[10px] bg-danger px-3.5 py-1.5 t-body font-bold text-on-dark disabled:opacity-60"
            >
              {deleting ? "삭제 중…" : "삭제"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="btn-soft px-3.5 py-1.5 t-body"
            >
              취소
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
