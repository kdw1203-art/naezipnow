"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { PASSWORD_MIN, passwordProblem, scorePassword } from "@/lib/auth/signup-form";
import { capsLockOn, passwordChangedLine } from "@/lib/auth/auth-ux";
import { CapsLockNote } from "@/app/components/auth/CapsLockNote";

/* [1040 · 로그인·가입 기능] 설정 › 계정 — 비밀번호 변경(로그인 상태에서 바로).
 *
 * 예전 줄은 비밀번호 찾기(/forgot-password)로 보냈다 — 메일함을 다녀와야 비밀번호를 바꿀 수 있었다.
 * 지금 비밀번호를 한 번 확인하고 이 자리에서 바꾼다(POST /api/me/password). 줄을 누르면 아래로 펼쳐진다.
 *  · 비밀번호가 없는 계정(카카오·구글·토스로만 가입) → 서버가 409 로 알린다 → "메일 링크로 설정" 길을 준다
 *  · 새 비밀번호: 가입 화면과 같은 강도 막대 · Caps Lock 표시 · 확인 칸 일치 표시
 *  · 변경 뒤 알림 메일(서버) — [1041] 서버가 실제로 보냈을 때만 "알림 메일 발송"을 적는다 */
type Phase = "closed" | "open" | "done" | "no_password";

export function PasswordChangeRow() {
  const [phase, setPhase] = useState<Phase>("closed");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<"current" | "next" | "next2" | null>(null);

  const pw = scorePassword(next);
  const matched = next2.length > 0 && next === next2;

  function fail(message: string, f: "current" | "next" | "next2" | null) {
    setError(message);
    setField(f);
    if (f) document.getElementById(`pwc-${f}`)?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setField(null);
    if (!current) return fail("지금 비밀번호 입력", "current");
    const problem = passwordProblem(next);
    if (problem) return fail(problem.replace(/^비밀번호/, "새 비밀번호"), "next");
    if (next === current) return fail("지금 비밀번호와 같음 · 다른 비밀번호", "next");
    if (next !== next2) return fail("새 비밀번호 확인 불일치", "next2");
    setBusy(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string; code?: string; noticeSent?: boolean };
      if (res.status === 409 && data.code === "no_password") {
        setPhase("no_password");
        return;
      }
      if (!res.ok) {
        const f = data.field === "current" || data.field === "next" ? data.field : null;
        return fail(res.status === 401 ? "로그인 필요 · 새로고침 후 다시" : (data.error ?? "비밀번호 변경 실패 · 잠시 후 다시"), f);
      }
      setCurrent("");
      setNext("");
      setNext2("");
      setNoticeSent(data.noticeSent === true);
      setPhase("done");
    } catch {
      fail("네트워크 오류 · 잠시 후 다시", null);
    } finally {
      setBusy(false);
    }
  }

  const keyProps = {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(capsLockOn(e)),
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(capsLockOn(e)),
    onBlur: () => setCaps(false),
  };
  const open = phase === "open";

  return (
    <div className="border-b border-divider">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="pwc-panel"
        onClick={() => {
          setError(null);
          setPhase((p) => (p === "open" ? "closed" : "open"));
        }}
        className="flex w-full items-center justify-between py-3 text-left t-body font-semibold text-text-1"
      >
        <span>비밀번호 변경</span>
        <span className="t-sub text-text-3">{phase === "done" ? "변경 완료" : open ? "닫기" : "›"}</span>
      </button>

      {phase === "done" && (
        <p role="status" className="pb-3 t-sub font-bold text-success">
          {passwordChangedLine("settings", noticeSent)}
        </p>
      )}

      {phase === "no_password" && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-3">
          <span className="t-sub text-text-2">비밀번호 없는 계정(소셜 가입)</span>
          <Link href="/forgot-password" className="inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline">
            메일 링크로 설정 ›
          </Link>
        </div>
      )}

      {open && (
        <form id="pwc-panel" onSubmit={onSubmit} noValidate className="flex flex-col gap-2 pb-4">
          {error && (
            <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 t-sub font-bold text-danger">
              {error}
            </div>
          )}
          <div className="njn-field">
            <input
              id="pwc-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder=" "
              autoComplete="current-password"
              enterKeyHint="next"
              aria-required="true"
              aria-invalid={field === "current" ? true : undefined}
              {...keyProps}
            />
            <label htmlFor="pwc-current">지금 비밀번호</label>
          </div>
          <div className="njn-field relative">
            <input
              id="pwc-next"
              type={showPw ? "text" : "password"}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder=" "
              autoComplete="new-password"
              enterKeyHint="next"
              aria-required="true"
              aria-invalid={field === "next" ? true : undefined}
              style={{ paddingRight: 64 }}
              {...keyProps}
            />
            <label htmlFor="pwc-next">새 비밀번호 ({PASSWORD_MIN}자 이상)</label>
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-pressed={showPw}
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
              className="absolute right-1 top-1/2 inline-flex h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg px-2 t-caption font-bold text-text-3"
            >
              {showPw ? "숨김" : "표시"}
            </button>
          </div>
          {next.length > 0 && (
            <div className="-mt-1 flex items-center gap-2 px-1">
              <span className="flex flex-1 gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((k) => (
                  <i
                    key={k}
                    className={`h-1 flex-1 rounded-sm ${
                      k <= pw.score ? (pw.score <= 1 ? "bg-danger" : pw.score === 2 ? "bg-warning" : "bg-success") : "bg-line"
                    }`}
                  />
                ))}
              </span>
              <span className={`t-caption font-bold ${pw.score <= 1 ? "text-danger" : pw.score === 2 ? "text-warning" : "text-success"}`}>
                {next.length < PASSWORD_MIN ? `${next.length}/${PASSWORD_MIN}자` : pw.hint}
              </span>
            </div>
          )}
          <div className="njn-field">
            <input
              id="pwc-next2"
              type={showPw ? "text" : "password"}
              value={next2}
              onChange={(e) => setNext2(e.target.value)}
              placeholder=" "
              autoComplete="new-password"
              enterKeyHint="done"
              aria-required="true"
              aria-invalid={field === "next2" || (next2.length > 0 && !matched) ? true : undefined}
              {...keyProps}
            />
            <label htmlFor="pwc-next2">새 비밀번호 확인</label>
          </div>
          {next2.length > 0 && (
            <p className={`-mt-1 px-1 t-caption font-bold ${matched ? "text-success" : "text-danger"}`} aria-live="polite">
              {matched ? "일치" : "불일치"}
            </p>
          )}
          <CapsLockNote on={caps} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={busy} className="btn-primary rounded-lg px-4 py-2.5 t-sub font-bold disabled:opacity-60">
              {busy ? "변경 중" : "비밀번호 변경"}
            </button>
            <Link href="/forgot-password" className="inline-flex min-h-10 items-center px-2 t-sub text-text-2 no-underline">
              지금 비밀번호 모름 ›
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
