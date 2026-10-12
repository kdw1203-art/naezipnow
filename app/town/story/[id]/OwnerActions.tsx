"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { hasSession } from "@/lib/client/has-session";
import { useToast } from "@/app/components/toast/ToastProvider";

/* [1058 · B8] 글쓴이의 수정·삭제.
 *
 * PATCH/DELETE /api/community/posts/[id] 는 있었는데(작성자 이메일·관리자만 통과) 상세 화면에 누르는 자리가 없었다.
 * 이 화면은 공유 캐시(ISR)라 서버 렌더가 뷰어를 모른다 — 세션이 있을 때만 GET …/comments/adopt 로
 * "글쓴이인가"를 묻고(CommentThread 와 같은 판정 지점 · 이메일은 내려오지 않는다), 아니면 아무것도 그리지 않는다.
 * 권한의 진실은 늘 서버(PATCH/DELETE 가 403)다.
 *
 *  · 삭제: "삭제" → 5초 안에 "삭제 · 확인" → DELETE → 토스트 "글 삭제" → /town
 *  · 수정: 제목(2~80자)·본문(5~20,000자)만 인라인 폼 — 작성과 같은 상한. 열 때 GET 으로 본문을 받는다
 *    (페이지 payload 에 본문을 두 번 싣지 않는다). 저장하면 PATCH → 서버가 상세를 재생성 → refresh. */

const TITLE_MAX = 80;
const BODY_MAX = 20_000;
const CONFIRM_MS = 5_000;

const fieldClass =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-3 t-body text-ink outline-none placeholder:text-text-3 focus:border-primary";

/** 글자 버튼 — 폰 40px · 데스크톱 24px 히트 */
const textTap = "inline-flex min-h-[40px] items-center px-2 t-sub font-bold md:min-h-6 md:px-0";

export function OwnerActions({ postId }: { postId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOwner, setIsOwner] = useState(false);
  const [mode, setMode] = useState<"idle" | "edit">("idle");
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    hasSession()
      .then((authed) =>
        authed ? fetch(`/api/community/posts/${postId}/comments/adopt`, { cache: "no-store" }) : null,
      )
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d: { isAuthor?: unknown } | null) => {
        if (!cancelled && d?.isAuthor === true) setIsOwner(true);
      })
      .catch(() => {
        /* 판정 실패 = 버튼 미노출. 수정·삭제 자체는 서버가 지킨다. */
      });
    return () => {
      cancelled = true;
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, [postId]);

  if (!isOwner) return null;

  async function openEdit() {
    if (busy) return;
    setBusy("load");
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { post?: { title?: string; body?: string } } | null;
      if (!res.ok || !data?.post) {
        setError("글 불러오기 실패 · 잠시 후 다시");
        return;
      }
      setTitle(String(data.post.title ?? ""));
      setBody(String(data.post.body ?? ""));
      setMode("edit");
    } catch {
      setError("글 불러오기 실패 · 잠시 후 다시");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (busy) return;
    const t = title.trim();
    const b = body.trim();
    if (t.length < 2 || t.length > TITLE_MAX) {
      setError(`제목은 2~${TITLE_MAX}자`);
      return;
    }
    if (b.length < 5 || b.length > BODY_MAX) {
      setError(`본문은 5~${BODY_MAX.toLocaleString("ko-KR")}자`);
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, body: b }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(res.status === 403 ? "글쓴이만 수정 가능" : (data?.error ?? "글 저장 실패 · 잠시 후 다시"));
        return;
      }
      setMode("idle");
      showToast("글 수정");
      router.refresh();
    } catch {
      setError("글 저장 실패 · 잠시 후 다시");
    } finally {
      setBusy(null);
    }
  }

  function askDelete() {
    setError(null);
    setConfirming(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirming(false), CONFIRM_MS);
  }

  async function remove() {
    if (busy) return;
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        setError(res.status === 403 ? "글쓴이만 삭제 가능" : "글 삭제 실패 · 잠시 후 다시");
        setConfirming(false);
        return;
      }
      showToast("글 삭제");
      router.push("/town");
      router.refresh();
    } catch {
      setError("글 삭제 실패 · 잠시 후 다시");
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  }

  if (mode === "edit") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-2 rounded-xl border border-line bg-bg p-3"
        aria-label="글 수정"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          aria-label="제목"
          className={fieldClass}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={8}
          aria-label="본문"
          className={`${fieldClass} min-h-[160px] resize-y leading-[1.6]`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="t-caption text-text-3">
            {title.trim().length}/{TITLE_MAX} · {body.trim().length.toLocaleString("ko-KR")}자
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
              disabled={busy !== null}
              className={`${textTap} text-text-2 disabled:opacity-50`}
            >
              취소
            </button>
            {/* 채움 파랑은 이 화면의 사이드바 CTA 하나뿐(규칙 9) — 저장은 soft */}
            <button
              type="submit"
              disabled={busy !== null}
              className="btn-soft min-h-[40px] rounded-lg px-3.5 t-sub font-bold disabled:opacity-60 md:min-h-9"
            >
              {busy === "save" ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="t-sub font-bold text-danger">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0 t-sub text-text-3 md:gap-3" aria-label="글쓴이 메뉴">
      <span className="t-caption">내 글</span>
      <button type="button" onClick={() => void openEdit()} disabled={busy !== null} className={`${textTap} text-primary disabled:opacity-50`}>
        {busy === "load" ? "불러오는 중…" : "제목·본문 수정"}
      </button>
      {confirming ? (
        <button
          type="button"
          onClick={() => void remove()}
          disabled={busy !== null}
          className="inline-flex min-h-[40px] items-center rounded-md bg-danger px-2.5 t-sub font-bold text-on-dark disabled:opacity-60 md:min-h-6 md:px-2"
        >
          {busy === "delete" ? "삭제 중…" : "삭제 · 확인"}
        </button>
      ) : (
        <button type="button" onClick={askDelete} disabled={busy !== null} className={`${textTap} text-text-3 hover:text-danger disabled:opacity-50`}>
          삭제
        </button>
      )}
      {error && (
        <span role="alert" className="t-sub font-bold text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
