"use client";
/* [1026 · 노트 쓰기] "저장 완료" 카드 — 저장 흐름의 끝(노트 상세 `?saved=1`, 작성자에게만)에서 한 장.
   저장 흐름: 새 노트 = 작성 → 썸네일 고르기(/cover, saved=1 을 넘긴다) → 상세 · 수정 = 작성 → 상세. 그래서 이 카드는
   상세 첫머리에 선다(상세 파일은 이 카드를 놓는 자리 한 곳만 바뀐다). 1025 표준 2·5:
     · 결론 한 줄(t-title) — "공작아파트 임장노트 · 점수 72 · 판단 살까" + 판정 칩 하나 + 근거 한 줄(방문 · 체크 · 사진)
       — 값은 상세가 이미 계산한 것(lib/notes/note-preview savedCardView)이고 여기서 새로 세지 않는다.
     · 다음 행동 — 채움 파랑 "공유하기"(Web Share → 없으면 링크 복사, ShareLinkButton) — **공개 노트일 때만**.
       비공개면 받은 사람이 못 여는 링크라 공유 대신 "공개로 바꾸기"(글자 버튼 · PATCH isPublic, 상세의 전환과 같은 API).
       글자 링크 둘 — "결정 카드에 담기"(이 기기 비교함 = /decide 후보, lib/newui/compare-tray) · "같은 단지 다른 노트".
   번들: 상세(/notes/[id])에 이미 있는 모듈(ShareLinkButton · compare-tray · toast)만 쓴다 — 이 파일 자체만 더해진다. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShareLinkButton } from "@/app/components/ShareLinkButton";
import { useToast } from "@/app/components/toast/ToastProvider";
import { addToCompareTray, COMPARE_TRAY_MAX } from "@/lib/newui/compare-tray";

type Tone = "good" | "normal" | "caution";
const TONE_CHIP: Record<Tone, string> = {
  good: "bg-success-soft text-success",
  normal: "bg-primary-soft text-primary",
  caution: "bg-warning-soft text-warning",
};
const DECIDE_HREF = "/decide";

export function NoteSavedCard(p: {
  noteId: string;
  headline: string;
  chip: { label: string; tone: Tone } | null;
  facts: string;
  isPublic: boolean;
  /** 결정 카드 후보로 담을 단지 — 단지 id 를 모르면 null(링크를 그리지 않는다) */
  complex: { id: string; name: string; region?: string } | null;
  sameComplex: { href: string; label: string } | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPublic, setIsPublic] = useState(p.isPublic);
  const [busy, setBusy] = useState(false);

  const makePublic = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inspection/notes/${encodeURIComponent(p.noteId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: true }),
      });
      if (res.status === 401) {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/notes/${p.noteId}`)}`);
        return;
      }
      if (!res.ok) {
        showToast("전환하지 못했어요. 다시 시도해 주세요");
        return;
      }
      setIsPublic(true);
      showToast("공개 노트로 전환했어요");
      router.refresh();
    } catch {
      showToast("연결이 끊겼어요. 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  };

  const addToDecide = () => {
    if (!p.complex) return;
    const r = addToCompareTray(p.complex);
    if (r.ok) {
      router.push(DECIDE_HREF);
      return;
    }
    showToast(
      r.reason === "full" ? `비교함은 ${COMPARE_TRAY_MAX}곳까지 담겨요` : "이 기기에 담지 못했어요",
      { label: "결정 카드", href: DECIDE_HREF },
    );
  };

  const link = "inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline";
  return (
    <section aria-labelledby="note-saved-title" className="lq-dot-blue card rise-in flex flex-col gap-2 rounded-2xl p-4 max-md:p-3.5">
      <h2 id="note-saved-title" className="t-section text-ink">
        저장 완료
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 t-title font-bold text-ink">{p.headline}</p>
        {p.chip && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 t-caption font-bold ${TONE_CHIP[p.chip.tone]}`}>{p.chip.label}</span>
        )}
      </div>
      {p.facts && <p className="t-sub text-text-2 t-num">{p.facts}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        {isPublic ? (
          <ShareLinkButton
            url={`/notes/${encodeURIComponent(p.noteId)}?utm_source=share&utm_medium=note`}
            title={p.headline}
            label="공유하기"
            className="btn-primary inline-flex min-h-10 items-center gap-1.5 rounded-lg px-4 t-body"
          />
        ) : (
          <button type="button" onClick={() => void makePublic()} disabled={busy} className={`${link} disabled:opacity-60`}>
            {busy ? "전환 중…" : "비공개 · 공개로 바꾸기 ›"}
          </button>
        )}
        {p.complex && (
          <button type="button" onClick={addToDecide} className={link}>
            결정 카드에 담기 ›
          </button>
        )}
        {p.sameComplex && (
          <Link href={p.sameComplex.href} className={link}>
            {p.sameComplex.label} ›
          </Link>
        )}
      </div>
    </section>
  );
}
