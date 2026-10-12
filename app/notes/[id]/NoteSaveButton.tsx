"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";

/* [1059] 임장노트 저장 — 공개 노트(남의 것)에서 "저장" / "저장됨". 저장소는 프로필 설정 jsonb(lib/bookmarks/settings-store).
 * 로그인 힌트 쿠키가 없으면 서버에 묻지 않고(1007 규칙) 누르면 가입·로그인 창. 상태는 마운트 뒤 GET ?type=note&id= 로. */

type Phase = "unknown" | "saved" | "unsaved";

export function NoteSaveButton({ noteId, label }: { noteId: string; label: string }) {
  const pathname = usePathname();
  const { promptSignup } = useSoftSignup();
  const [authed, setAuthed] = useState(false);
  const [phase, setPhase] = useState<Phase>("unknown");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!readAuthedHint()) return;
    setAuthed(true);
    let alive = true;
    fetch(`/api/bookmarks?type=note&id=${encodeURIComponent(noteId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ saved?: boolean }>) : null))
      .then((j) => {
        if (alive && j) setPhase(j.saved ? "saved" : "unsaved");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [noteId]);

  const toggle = async () => {
    if (busy) return;
    if (!authed) {
      promptSignup({
        action: "note_save",
        title: "로그인 필요 · 노트 저장",
        benefit: "저장한 노트는 마이 › 관심 › 저장 탭에 모임",
        callbackUrl: pathname ?? `/notes/${noteId}`,
      });
      return;
    }
    setBusy(true);
    setNote(null);
    const saving = phase !== "saved";
    try {
      const res = saving
        ? await fetch("/api/bookmarks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "note", id: noteId, label }),
          })
        : await fetch(`/api/bookmarks?type=note&id=${encodeURIComponent(noteId)}`, { method: "DELETE" });
      if (res.status === 401) {
        setAuthed(false);
        promptSignup({ action: "note_save", title: "로그인 필요 · 노트 저장", benefit: "저장한 노트는 마이 › 관심 › 저장 탭에 모임", callbackUrl: pathname ?? `/notes/${noteId}` });
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setNote(j.error ?? (saving ? "저장 실패 · 잠시 후 다시" : "저장 해제 실패 · 잠시 후 다시"));
        return;
      }
      setPhase(saving ? "saved" : "unsaved");
    } catch {
      setNote(saving ? "저장 실패 · 잠시 후 다시" : "저장 해제 실패 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  };

  const saved = phase === "saved";
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={saved}
        className={`btn-soft inline-flex min-h-[40px] items-center px-3.5 py-2 t-body disabled:opacity-60 md:min-h-6 ${saved ? "font-bold text-primary" : ""}`}
      >
        {busy ? "저장 중" : saved ? "저장됨" : "저장"}
      </button>
      {note && (
        <span role="status" className="mt-1 t-caption text-danger">
          {note}
        </span>
      )}
    </span>
  );
}
