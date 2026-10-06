"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/app/components/Logo";
import { Icon } from "@/app/components/Icon";
import { PASSWORD_MIN, passwordProblem, scorePassword, stashAuthEmail } from "@/lib/auth/signup-form";
import { capsLockOn, forgotHrefWithNext, loginHrefWithNext, passwordChangedLine, safeNextPath } from "@/lib/auth/auth-ux";
import { CapsLockNote } from "@/app/components/auth/CapsLockNote";
/* 최적화 19 — supabase-js 는 **필요할 때** 불러온다.
   정적 import 이던 시절 이 페이지의 First Load JS 는 181kB 였고, 그중 약 66kB가
   @supabase/supabase-js 였다(realtime·storage·functions 포함 — 여기서 쓰는 건
   auth 하나뿐인데도 통째로 들어온다).
   그런데 이 화면의 주 경로는 `?token=` 쿼리(자체 토큰)이고, 그 경로는 fetch 만
   쓰고 supabase 를 **한 번도 부르지 않는다**. 비밀번호 재설정 링크는 메일에서
   눌러 들어오는 자리라 첫 로드가 곧 체감이다 — 안 쓰는 66kB를 미리 받게 할
   이유가 없다. 그래서 supabase 복구 링크(hash) 경로에서만 동적으로 가져온다. */
const loadSupabase = () =>
  import("@/lib/supabase/browser").then((m) => m.createSupabaseBrowserClient());

/**
 * 새 비밀번호 설정 — 구 app/auth/reset-password 포트.
 * 두 가지 재설정 플로우를 모두 지원합니다.
 *  1) `?token=` 쿼리 — 자체 토큰 (/api/auth/reset-password GET 검증 → POST 변경)
 *  2) URL hash 의 access_token — Supabase Auth 복구 링크 (updateUser)
 */
type Mode = "checking" | "token" | "supabase" | "invalid";

/* [1040 · 로그인·가입 기능]
 *  · 강도 규칙은 가입 화면과 같은 함수(lib/auth/signup-form scorePassword) — 여기 따로 있던 복사본을 지웠다
 *  · 가려던 곳(?next= — 재설정 메일 링크가 싣는다)과 이메일을 로그인 화면으로 넘긴다(다시 치지 않고, 원래 화면으로)
 *  · Caps Lock 표시 · 확인 칸 일치 표시 · 유출·흔한 비밀번호 거절을 우리말로 */

/** Supabase 복구 경로의 거절 문구 → 우리말(모르는 문구는 일반 문장) */
function recoveryErrorCopy(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("weak") || m.includes("pwned") || m.includes("easy to guess")) return "쓸 수 없는 비밀번호 · 유출됐거나 너무 흔함";
  if (m.includes("different from the old") || m.includes("same password")) return "지금 비밀번호와 같음 · 다른 비밀번호";
  if (m.includes("session") || m.includes("expired") || m.includes("jwt")) return "링크 만료 · 비밀번호 찾기 다시";
  return "비밀번호 변경 실패 · 잠시 후 다시";
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("checking");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  /* [1041] 변경 알림 메일을 서버가 실제로 보냈는가 — 보냈을 때만 완료 화면이 그 말을 한다 */
  const [noticeSent, setNoticeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState(false);
  /* 가려던 곳 — 마운트 후에만 읽는다(서버·첫 렌더 불일치 방지) */
  const [next, setNext] = useState<string | null>(null);
  const loginHref = loginHrefWithNext(next);

  const strength = useMemo(() => scorePassword(password), [password]);
  const matched = password2.length > 0 && password === password2;

  useEffect(() => {
    setNext(safeNextPath(new URLSearchParams(window.location.search).get("next")));
    const qsToken = new URLSearchParams(window.location.search).get("token") ?? "";
    if (qsToken) {
      setToken(qsToken);
      fetch(`/api/auth/reset-password?token=${encodeURIComponent(qsToken)}`)
        .then((r) => r.json())
        .then((d: { valid?: boolean }) => setMode(d.valid ? "token" : "invalid"))
        .catch(() => setMode("invalid"));
      return;
    }

    // Supabase 복구 링크 — hash 의 access_token 처리 대기
    if (window.location.hash.includes("access_token")) {
      queueMicrotask(() => setMode("supabase"));
    }
    /* 4초 안에 아무 신호도 없으면 잘못된 링크로 본다. 이 타이머는 supabase 로드
       성공 여부와 무관하게 걸어 둔다 — 모듈을 못 받아 오면 "확인 중" 에서 영원히
       멈추는 화면이 되기 때문이다. */
    const timer = window.setTimeout(() => {
      setMode((m) => (m === "checking" ? "invalid" : m));
    }, 4000);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      const sb = await loadSupabase().catch(() => null);
      if (cancelled) return;
      if (!sb) {
        if (!window.location.hash.includes("access_token")) {
          setMode((m) => (m === "checking" ? "invalid" : m));
        }
        return;
      }
      const { data: sub } = sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") {
          queueMicrotask(() => setMode("supabase"));
        }
      });
      /* 로드가 끝나기 전에 화면을 떠났을 수 있다 — 그때는 바로 해지한다 */
      if (cancelled) sub.subscription.unsubscribe();
      else unsubscribe = () => sub.subscription.unsubscribe();
      /* [965] token_hash(verifyOtp)·PKCE(/auth/callback) 경로는 세션이 **이미**
         쿠키에 있고 이 화면에서는 PASSWORD_RECOVERY 가 다시 나지 않는다.
         세션이 있으면 그 사용자가 비밀번호를 바꿀 수 있는 상태다 — 폼을 연다. */
      try {
        const { data: sess } = await sb.auth.getSession();
        if (!cancelled && sess.session) {
          setMode((m) => (m === "checking" ? "supabase" : m));
        }
      } catch {
        /* 세션 조회 실패는 타이머가 invalid 로 정리한다 */
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
      window.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      document.getElementById("reset-password-new")?.focus();
      return;
    }
    if (password !== password2) {
      setError("비밀번호 확인 불일치");
      document.getElementById("reset-password-confirm")?.focus();
      return;
    }
    setBusy(true);
    try {
      if (mode === "token") {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string; noticeSent?: boolean };
        if (!res.ok) {
          setError(data.error ?? "비밀번호 변경에 실패했습니다.");
          return;
        }
        /* [1040] 로그인 화면이 이메일을 채워 둔다(주소가 아니라 탭 저장소로) */
        if (data.email) stashAuthEmail(data.email);
        setNoticeSent(data.noticeSent === true);
      } else {
        const sb = await loadSupabase().catch(() => null);
        if (!sb) {
          setError("클라이언트 설정을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
          return;
        }
        const { error: err } = await sb.auth.updateUser({ password });
        if (err) {
          setError(recoveryErrorCopy(err.message));
          return;
        }
        try {
          const { data: who } = await sb.auth.getUser();
          if (who.user?.email) stashAuthEmail(who.user.email);
        } catch {
          /* 이메일을 못 읽어도 변경은 끝났다 */
        }
        /* [965] 복구 링크로 생긴 임시 세션은 여기서 끝낸다 — 이 화면의 목적은
           비밀번호 변경이지 로그인이 아니고, 앱 세션은 Auth.js 쿠키가 따로 관리한다. */
        await sb.auth.signOut({ scope: "local" }).catch(() => {});
      }
      setDone(true);
      setTimeout(() => router.push(loginHrefWithNext(next)), 3000);
    } catch {
      setError("오류가 발생했습니다. 초기화 링크가 만료되었을 수 있습니다.");
    } finally {
      setBusy(false);
    }
  }

  const bars = [0, 1, 2, 3].map((i) => (
    <span
      key={i}
      className={`h-1 flex-1 rounded-full ${
        i < strength.score
          ? strength.score >= 3
            ? "bg-success-fill"
            : strength.score >= 2
              ? "bg-warning"
              : "bg-danger"
          : "bg-line"
      }`}
    />
  ));

  return (
    <main
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
          새 비밀번호 설정
        </h1>
        <p className="rise-in-2 text-[13px] text-text-2">
          {PASSWORD_MIN}자 이상 · 대소문자·숫자·기호 섞기
        </p>

        {done ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-2xl px-5 py-6 text-center">
            <Icon name="✅" size={28} />
            <div className="text-[15px] font-bold text-ink">비밀번호 변경 완료</div>
            <p className="text-[13px] text-text-2" aria-live="polite">{passwordChangedLine("reset", noticeSent)}</p>
            <Link
              href={loginHref}
              className="btn-primary mt-2 rounded-lg p-3 text-center text-[13px] font-bold"
            >
              로그인
            </Link>
          </div>
        ) : mode === "checking" ? (
          <div className="rise-in card rounded-2xl px-5 py-6 text-center text-[13px] text-text-2">
            링크를 확인하는 중입니다…
          </div>
        ) : mode === "invalid" ? (
          <div className="rise-in card flex flex-col gap-2.5 rounded-2xl px-5 py-6 text-center">
            <Icon name="⚠" size={28} />
            <div className="text-[15px] font-bold text-ink">링크가 유효하지 않습니다</div>
            <p className="text-[13px] leading-[1.6] text-text-2">
              링크가 만료됐거나 이미 사용됐습니다. 이메일의 링크로 접근했는지 확인하고, 다시
              비밀번호 찾기를 요청해 주세요.
            </p>
            <Link
              href={forgotHrefWithNext(next)}
              className="btn-primary mt-2 rounded-lg p-3 text-center text-[13px] font-bold"
            >
              비밀번호 찾기 다시 하기
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div
                role="alert"
                className="rise-in rounded-lg bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
              >
                {error}
              </div>
            )}
            <form onSubmit={onSubmit} noValidate className="rise-in-3 flex flex-col gap-2">
              <div className="njn-field relative">
                <input
                  id="reset-password-new"
                  type={showPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  /* [968 · 29] "다음" — Enter 는 제출이 아니라 확인 칸으로 */
                  enterKeyHint="next"
                  onKeyDown={(e) => {
                    setCaps(capsLockOn(e));
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    document.getElementById("reset-password-confirm")?.focus();
                  }}
                  onKeyUp={(e) => setCaps(capsLockOn(e))}
                  aria-required="true"
                  aria-describedby="reset-password-hint"
                  style={{ paddingRight: 64 }}
                />
                <label htmlFor="reset-password-new">새 비밀번호 ({PASSWORD_MIN}자 이상)</label>
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
              {password && (
                <div className="-mt-1 flex items-center gap-2 px-1">
                  <span className="flex flex-1 gap-1" aria-hidden="true">{bars}</span>
                  <span
                    id="reset-password-hint"
                    className={`t-caption font-bold ${strength.score <= 1 ? "text-danger" : strength.score === 2 ? "text-warning" : "text-success"}`}
                    aria-live="polite"
                  >
                    {password.length < PASSWORD_MIN ? `${password.length}/${PASSWORD_MIN}자` : strength.hint}
                  </span>
                </div>
              )}
              <div className="njn-field">
                <input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  placeholder=" "
                  enterKeyHint="done"
                  onKeyDown={(e) => setCaps(capsLockOn(e))}
                  onKeyUp={(e) => setCaps(capsLockOn(e))}
                  onBlur={() => setCaps(false)}
                  aria-required="true"
                  aria-invalid={Boolean(password2) && password !== password2 ? true : undefined}
                  aria-describedby="reset-password-match"
                />
                <label htmlFor="reset-password-confirm">비밀번호 확인</label>
              </div>
              {/* [1040] 일치 여부 — 틀렸을 때만 빨갛게 말하던 것을, 맞았을 때도 한 줄로 */}
              <p
                id="reset-password-match"
                role={password2 && !matched ? "alert" : "status"}
                className={`-mt-1 min-h-[18px] px-1 t-caption font-bold ${matched ? "text-success" : "text-danger"}`}
              >
                {password2 ? (matched ? "일치" : "불일치") : ""}
              </p>
              <CapsLockNote on={caps} />
              <button
                type="submit"
                disabled={busy}
                className="btn-primary rounded-lg p-3 text-center text-[13px] font-bold disabled:opacity-60"
              >
                {busy ? "변경 중…" : "비밀번호 변경"}
              </button>
            </form>
            <p className="rise-in-4 t-caption text-text-3">변경 즉시 적용</p>
          </>
        )}

        {/* [970 · A-41] 링크를 폼 바로 아래로(스페이서 위) — forgot-password 와 같은 이유 */}
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
