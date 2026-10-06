"use client";

import { emailProblem, mailboxFor, normalizeEmail, RESEND_COOLDOWN_SEC, stashAuthEmail, takeAuthEmail } from "@/lib/auth/signup-form";
import { loginHrefWithNext, safeNextPath } from "@/lib/auth/auth-ux";
import { ActionButton } from "@/app/components/ui/ActionButton";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/Logo";

/** 비밀번호 찾기 — 구 app/auth/forgot-password 포트 (기존 /api/auth/forgot-password 연결 유지)
 *
 * [1040 · 로그인·가입 기능]
 *  · 가려던 곳(callbackUrl)을 재설정 메일 링크까지 싣는다 → 재설정 뒤 로그인하면 원래 화면으로 간다
 *    (예전엔 여기서 끊겨 홈으로 떨어졌다 — 1039 뒤로 미룬 항목)
 *  · 보낸 뒤: 메일함 바로가기(네이버·Gmail·다음…) · 다시 보내기(30초 대기) · 다른 이메일로
 *  · 칸: 떠오르는 라벨 + 칸 아래 오류(가입·로그인 화면과 같은 모양) */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [next, setNext] = useState<string | null>(null);
  /* [991] 로그인 화면이 "비밀번호가 맞지 않아요 → 비밀번호 찾기 ›" 로 보낼 때 이메일을 넘긴다 —
     방금 친 주소를 다시 치게 하지 않는다. 마운트 후에만 읽는다(서버·첫 렌더 불일치 방지). */
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      /* [1039] 로그인·가입 화면이 탭 저장소로 넘긴 이메일을 먼저(주소에 싣지 않는 길) */
      const q = takeAuthEmail() ?? params.get("email");
      if (q && q.includes("@")) setEmail(q);
      setNext(safeNextPath(params.get("callbackUrl")));
    } catch {
      /* ignore */
    }
  }, []);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string | null>(null);
  /* [1040] 다시 보내기 대기 — 서버 한도(IP당 10분 5회)를 화면에서 먼저 지킨다 */
  const [resendUntil, setResendUntil] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const resendLeft = resendUntil > nowMs ? Math.ceil((resendUntil - nowMs) / 1000) : 0;
  useEffect(() => {
    if (resendUntil <= Date.now()) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= resendUntil) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendUntil]);

  async function send(): Promise<boolean> {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizeEmail(email), ...(next ? { next } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(res.status === 429 ? "요청 한도 초과 · 10분 뒤 다시" : (data.error ?? "메일 보내기 실패 · 잠시 후 다시"));
      return false;
    }
    setResendUntil(Date.now() + RESEND_COOLDOWN_SEC * 1000);
    return true;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const problem = emailProblem(email);
    setFieldErr(problem);
    if (problem) {
      document.getElementById("forgot-email")?.focus();
      return;
    }
    setBusy(true);
    try {
      if (await send()) setSent(true);
    } catch {
      setError("네트워크 오류 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setResendNote(null);
    setBusy(true);
    try {
      if (await send()) setResendNote("다시 보냄 · 가장 최근 메일의 링크만 유효");
    } catch {
      setError("네트워크 오류 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  }

  const loginHref = loginHrefWithNext(next);
  const mailbox = sent ? mailboxFor(email) : null;

  return (
    <main
      id="main-content"
      /* [968 · 31] 100vh → dvh: iOS 주소창이 보일 때 아래 "로그인" 링크가 주소창 뒤로 밀렸다 */
      className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex justify-end">
        {/* [966] .tap — ✕ 링크 주변 8px 까지 눌린다 */}
        <Link href={loginHref} className="tap text-[15px] text-text-3" aria-label="닫기">
          ✕
        </Link>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-3.5">
        <div className="rise-in">
          <Logo size={34} />
        </div>
        <h1 className="rise-in-1 text-[21px] font-bold leading-[1.35] text-ink">
          비밀번호 찾기
        </h1>
        <p className="rise-in-2 text-[13px] text-text-2">
          {sent ? "재설정 링크 보냄 · 60분 유효" : "가입 이메일 · 재설정 링크 발송"}
        </p>

        {error && (
          <div
            role="alert"
            className="rise-in rounded-lg bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
          >
            {error}
          </div>
        )}

        {sent ? (
          <div className="rise-in card flex flex-col gap-3 rounded-2xl px-5 py-5">
            <div className="t-body font-bold text-ink [overflow-wrap:anywhere]">{normalizeEmail(email)}</div>
            <ol className="flex list-decimal flex-col gap-1 pl-5 t-sub text-text-2">
              <li>메일의 재설정 링크 열기</li>
              <li>새 비밀번호 입력(8자 이상)</li>
              <li>로그인</li>
            </ol>
            {/* [1040] 채움 단추는 하나 — 메일함을 아는 주소면 메일함으로, 아니면 로그인으로 */}
            <a
              href={mailbox ? mailbox.href : loginHref}
              {...(mailbox ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={() => {
                if (!mailbox) stashAuthEmail(email);
              }}
              className="btn-primary rounded-lg p-3 text-center text-[13px] font-bold no-underline"
            >
              {mailbox ? `${mailbox.label} 열기` : "로그인으로"}
            </a>
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0">
              <button
                type="button"
                onClick={resend}
                disabled={busy || resendLeft > 0}
                className="inline-flex min-h-10 items-center px-2 t-sub font-bold text-primary disabled:text-text-3"
              >
                {busy ? "보내는 중" : resendLeft > 0 ? `다시 보내기 · ${resendLeft}초` : "다시 보내기"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setResendNote(null);
                }}
                className="inline-flex min-h-10 items-center px-2 t-sub font-bold text-text-2"
              >
                이메일 고치기
              </button>
              {mailbox && (
                <Link
                  href={loginHref}
                  onClick={() => stashAuthEmail(email)}
                  className="inline-flex min-h-10 items-center px-2 t-sub font-bold text-text-2 no-underline"
                >
                  로그인으로
                </Link>
              )}
            </div>
            <p className="t-caption text-text-3" aria-live="polite">
              {resendNote ?? "스팸함 확인 · 10분 넘게 안 오면 "}
              {!resendNote && (
                /* [1002] 10분이 지나도 안 오면 — 기다리게 두지 않고 다음 길을 준다 */
                <Link
                  href="/support?category=account&topic=password-reset"
                  className="inline-block py-[5px] font-bold text-primary underline underline-offset-2"
                >
                  고객센터 계정 문의
                </Link>
              )}
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={onSubmit} noValidate className="rise-in-3 flex flex-col gap-2">
              <div className="njn-field">
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErr) setFieldErr(null);
                  }}
                  placeholder=" "
                  autoComplete="email"
                  inputMode="email"
                  /* [968 · 29] 한 칸짜리 폼 — Enter 가 곧 제출이라 "완료" */
                  enterKeyHint="done"
                  aria-required="true"
                  aria-invalid={fieldErr ? true : undefined}
                  aria-describedby={fieldErr ? "forgot-email-err" : undefined}
                />
                <label htmlFor="forgot-email">가입 이메일</label>
              </div>
              {fieldErr && (
                <p id="forgot-email-err" className="-mt-1 px-1 t-caption font-bold text-danger">
                  {fieldErr}
                </p>
              )}
              <ActionButton
                type="submit"
                state={busy ? "busy" : error ? "error" : "idle"}
                busyLabel="전송 중"
                errorLabel="다시 확인"
                className="rounded-lg p-3 text-center text-[13px] font-bold"
              >
                재설정 링크 받기
              </ActionButton>
            </form>
            <p className="rise-in-4 t-caption text-text-3">링크 유효 60분 · 소셜 가입 계정도 비밀번호 설정 가능</p>
          </>
        )}

        {/* [970 · A-41] 예전엔 flex-1 스페이서 **뒤**에 있어 폼과 링크 사이가 화면 높이만큼
            비었다(min-h-dvh). 폼 바로 아래로 올린다 — 스페이서는 그 아래에 남겨 상단 정렬 유지. */}
        <div className="rise-in-5 mt-2 text-center text-xs text-text-3">
          비밀번호를 기억한다면{" "}
          <Link href={loginHref} className="font-bold text-primary">
            로그인
          </Link>
        </div>

        <div className="flex-1" />
      </div>
    </main>
  );
}
