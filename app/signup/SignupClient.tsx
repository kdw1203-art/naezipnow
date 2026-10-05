"use client";
/* [1026c · 폰 배율 1] 동의 체크박스 — 폰 간격 단위(3px)에서 h-5 가 15px 이었다. 20px 고정 + 40px 손끝 칸(span)으로 감싼다(옆 글자가 탭을 가져가지 않게). */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { Icon } from "@/app/components/Icon";
import { stashSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { useMoment } from "@/app/components/motion/MomentProvider";
import { safeInternalPath } from "@/lib/safe-path";
import type { SocialProvider } from "@/lib/auth/configured-social";
import { markOncePerSession, useFirstInteraction } from "@/lib/client/human-gate";
import { browserFamily, deviceClass } from "@/lib/client/browser-family";
import {
  EMAIL_RE,
  NAME_MAX,
  PASSWORD_MIN,
  RESEND_COOLDOWN_SEC,
  emailProblem,
  emailTypoFix,
  mailboxFor,
  normalizeEmail,
  passwordProblem,
  scorePassword,
  stashAuthEmail,
  takeAuthEmail,
} from "@/lib/auth/signup-form";

/** [970 · A-14] 가입 뒤 목적지 — 온보딩(/welcome)을 거치되, 로그인 벽에서 넘어온
    callbackUrl 이 있으면 `?next=` 로 실어 온보딩 마지막 CTA 가 그리로 보낸다(WelcomeClient).
    내부 경로만(safeInternalPath), 홈이면 싣지 않는다. 마운트 후에만 읽는다(하이드레이션). */
function welcomeHrefFor(callbackUrl: string | null): string {
  const next = safeInternalPath(callbackUrl, "/");
  return next === "/" ? "/welcome" : `/welcome?next=${encodeURIComponent(next)}`;
}

const SOCIAL_BUTTON: Record<SocialProvider, { label: string; className: string }> = {
  /* 카카오 브랜드 가이드 — 배경 #FEE500 · 라벨 #191919 고정 */
  kakao: {
    label: "카카오로 가입",
    className: "bg-[#fee500] text-[#191919] shadow-[0_6px_16px_rgba(254,229,0,.3)]",
  },
  toss: {
    label: "토스로 가입",
    className: "bg-[#3182f6] text-white shadow-[0_6px_16px_rgba(49,130,246,.35)]",
  },
  google: {
    label: "Google로 가입",
    className: "border border-line bg-surface text-text-1",
  },
};

/* [개선 #9, 2026-08-22] 목표·관심지역 선택을 가입에서 **제거**했다.
   30일 실측: 진입 44명 → 목표 클릭 1명 → 완료 3명. 한 화면에 목표 3택 +
   지역 검색 + 계정 폼 + 동의 3종을 다 요구하던 것이 이탈 지점이었다.
   목표·지역은 가입 직후 온보딩(/welcome)이 **원래부터 다시 수집**하므로
   여기서 물을 이유가 없었다(중복 질문). 가입은 계정 최소한만 남긴다. */

type RegisterResponse = {
  error?: string;
  detail?: string;
  code?: string;
  message?: string;
  emailConfirmationRequired?: boolean;
  resent?: boolean;
  user?: { id: string | number; email: string; name: string };
};

export function SignupClient({ social }: { social: SocialProvider[] }) {
  const router = useRouter();
  const { showMoment } = useMoment();
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /* [개선 #9] 비밀번호 확인칸 제거 — 표시 토글로 오타를 눈으로 확인한다
     (칸 하나가 줄고, 모바일에서 두 번 입력하는 마찰이 사라진다). */
  const [showPw, setShowPw] = useState(false);
  /* [1039] 필수 동의 한 칸(약관·방침·만 14세) — 그 위에 "전체 동의"(선택 2개 포함)를 둔다 */
  const [agree, setAgree] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [agreeLocation, setAgreeLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* [1039] 칸마다 오류 — 제출 때 한꺼번에 세우고, 고치면 그 칸만 지운다. 칸을 떠났을 때(touched)도 그 칸만 본다 */
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string; consent?: string }>({});
  const [touched, setTouched] = useState<{ email?: boolean }>({});
  /* [1039] 이미 가입된 이메일 — 문장 대신 다음 행동 두 개(로그인 · 비밀번호 찾기) */
  const [dupEmail, setDupEmail] = useState<string | null>(null);
  /* [1039] 자동 입력 봇 덫 — 사람 눈에 안 보이는 칸. 채워져 오면 서버가 거절한다 */
  const [hp, setHp] = useState("");
  /* [1039] 인증 메일 안내 화면 — 예전 "done" 분기("가입이 완료됐어요")는 도달할 수 없는 코드였다(자동 로그인 뒤 /welcome 으로 떠난다) */
  const [done, setDone] = useState(false);
  const [confirmHint, setConfirmHint] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const doneTitleRef = useRef<HTMLHeadingElement | null>(null);
  /* [970 · A-14] 가입 뒤 목적지(/welcome 또는 /welcome?next=…) — 서버 렌더는 /welcome */
  const [welcomeHref, setWelcomeHref] = useState("/welcome");
  /* 로그인으로 되돌아가는 링크(뒤로·이미 계정이 있나요)도 같은 callbackUrl 을 유지한다 */
  const [loginHref, setLoginHref] = useState("/login");
  useEffect(() => {
    try {
      const cb = new URLSearchParams(window.location.search).get("callbackUrl");
      setWelcomeHref(welcomeHrefFor(cb));
      const safe = safeInternalPath(cb, "/");
      if (safe !== "/") setLoginHref(`/login?callbackUrl=${encodeURIComponent(safe)}`);
      /* [1039] 로그인 화면 "이 이메일로 가입하기"가 넘긴 주소 — 탭 저장소로 받는다(주소에 싣지 않는다) */
      const carried = takeAuthEmail();
      if (carried) setEmail(carried);
    } catch {
      /* 주소 파싱 실패 — 기본 /welcome · /login */
    }
  }, []);

  /* #44 가입 퍼널 계측 — /api/platform/event 로 fire-and-forget POST (실패해도 UI 무영향).
     step_1: 가입 화면에서 처음 움직임(1027 — 예전: 페이지 진입) · step_2: 목표 선택 · step_3: 기본정보/관심지역 첫 선택 ·
     step_4: 계정 폼 제출 시도 · signup_complete: 가입 성공. 스텝당 1회만 전송. */
  const firedSteps = useRef<Set<string>>(new Set());
  const trackStep = useCallback(
    (eventName: string, metadata?: Record<string, unknown>) => {
      if (firedSteps.current.has(eventName)) return;
      firedSteps.current.add(eventName);
      trackPlatformEvent({
        eventName,
        source: "signup",
        campaign: "funnel",
        metadata: { funnel: "signup", ...metadata },
      });
    },
    [],
  );

  /* [945 #11] 소프트 가입 프롬프트 수락 귀속 — SoftSignupProvider 가 남긴 키.
     "soft:watchlist_add" 형식. 가입 완료 시 register 의 source/campaign 으로
     보내져, 클릭 수가 아니라 **가입 완료 수**로 프롬프트 효과를 잰다. */
  const signupViaRef = useRef<string | null>(null);
  useEffect(() => {
    try {
      signupViaRef.current = window.sessionStorage.getItem("nz_signup_via");
    } catch {
      signupViaRef.current = null;
    }
  }, []);
  /* [1027 · 제안 29] "가입 1단계"는 화면이 열릴 때가 아니라 **사람이 처음 움직인 뒤**, 세션당 한 번만 찍는다.
     운영 실측(2026-09-11~10-01): 451건이 찍혔는데 실제 가입은 2명 — 전부 신원 없는 PC 접속이었고
     화면만 열고 떠났다(상태 점검·화면 캡처로 보인다). 브라우저 계열·기기를 같이 남겨 다음에는 무엇이 찍었는지 보이게 한다.
     뒤 단계(step_4 · signup_complete)는 폼 제출에서 찍히므로 그대로다. */
  const moved = useFirstInteraction();
  useEffect(() => {
    if (!moved) return;
    if (!markOncePerSession("nz_evt_signup_step_1")) return;
    trackStep("signup_step_1", {
      ...(signupViaRef.current ? { via: signupViaRef.current } : {}),
      browser: browserFamily(navigator.userAgent),
      device: deviceClass(navigator.userAgent),
    });
  }, [moved, trackStep]);

  /* 관심 지역·목표·인구통계는 전부 온보딩(/welcome)이 수집한다(개선 #9). */
  useEffect(() => {
    stashSignupHandoff({ regions: [], profile: {}, purpose: null });
  }, []);

  const emailOk = EMAIL_RE.test(normalizeEmail(email));
  const progressDone = [emailOk, password.length >= PASSWORD_MIN, agree].filter(Boolean).length;
  const progressPct = Math.round((progressDone / 3) * 100);
  const pw = scorePassword(password);
  const typoFix = emailTypoFix(email);
  const allAgreed = agree && agreeMarketing && agreeLocation;
  /* 칸을 떠난 뒤에만 그 칸 오류를 보인다(치는 중에는 조용히) — 제출 오류가 있으면 그것이 먼저 */
  const emailErr = fieldErr.email ?? (touched.email && email ? emailProblem(email) ?? undefined : undefined);
  /* 비밀번호는 치는 동안 강도 줄("5/8자")이 같은 말을 하므로, 오류 줄은 제출했을 때만 세운다(같은 말 두 줄 금지) */
  const passwordErr = fieldErr.password;

  /* 인증 메일 안내 화면으로 바뀌면 제목으로 초점 — 화면 낭독기가 바뀐 화면을 읽는다 */
  useEffect(() => {
    if (done) doneTitleRef.current?.focus();
  }, [done]);
  /* 재발송 대기 — 1초씩 줄인다 */
  useEffect(() => {
    if (resendWait <= 0) return;
    const t = window.setTimeout(() => setResendWait((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendWait]);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
    setDupEmail(null);
    setSocialBusy(provider);
    stashSignupHandoff({ regions: [], profile: {}, purpose: null });
    trackStep("signup_step_4", { method: provider });
    // 토스는 자체 리다이렉트 시작점 — 인가 후 /auth/toss/callback 이 세션을 만든다.
    // [970 · A-14] 목적지는 welcomeHref(/welcome 또는 /welcome?next=…)
    if (provider === "toss") {
      window.location.href = `/api/auth/toss/start?callbackUrl=${encodeURIComponent(welcomeHref)}`;
      return;
    }
    try {
      await signIn(provider, { callbackUrl: welcomeHref });
    } catch {
      setError("소셜 가입 실패 · 잠시 후 다시");
      setSocialBusy(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDupEmail(null);
    trackStep("signup_step_4");
    const normalizedEmail = normalizeEmail(email);
    /* [1039] 세 칸을 한 번에 검사해 칸마다 표시하고, 첫 오류 칸으로 초점을 옮긴다(예전: 오류 한 줄 · 초점 그대로) */
    const errs = {
      email: emailProblem(email) ?? undefined,
      password: passwordProblem(password) ?? undefined,
      consent: agree ? undefined : "필수 동의 필요",
    };
    setFieldErr(errs);
    const firstBad = errs.email ? "signup-email" : errs.password ? "signup-password" : errs.consent ? "signup-agree" : null;
    if (firstBad) {
      document.getElementById(firstBad)?.focus();
      return;
    }
    setBusy(true);
    try {
      // 구 회원가입 API 스펙(/api/auth/register)에 맞춘 전송 필드
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim().slice(0, NAME_MAX),
          source: signupViaRef.current ? "soft_signup" : "onboarding_signup",
          campaign: signupViaRef.current?.replace(/^soft:/, "") || "default",
          /* [1039] 인증 메일 링크를 누른 뒤에도 목적지(/welcome[?next])를 잃지 않게 서버로 보낸다 */
          next: welcomeHref,
          website: hp,
          consent: {
            terms: true,
            privacy: true,
            age: true,
            marketing: agreeMarketing,
            location: agreeLocation,
          },
        }),
      });
      const raw = await res.text();
      let data: RegisterResponse;
      try {
        data = (raw ? JSON.parse(raw) : {}) as RegisterResponse;
      } catch {
        data = {};
      }
      if (!res.ok) {
        if (res.status === 409 || data.code === "already_registered") {
          setDupEmail(normalizedEmail);
          return;
        }
        /* [1039] 서버 원문(영문 DB·인증 메시지)은 화면에 붙이지 않는다 — 한글로 풀어 준 설명만 */
        const detail = data.detail && /[가-힣]/.test(data.detail) ? ` · ${data.detail}` : "";
        setError(`${data.error ?? "가입 실패 · 잠시 후 다시"}${detail}`);
        return;
      }
      /* [1039] 재발송(이미 만든 미인증 계정)은 새 가입이 아니다 — 완료로 세지 않는다 */
      if (!data.resent) {
        trackStep("signup_complete", {
          emailConfirmationRequired: Boolean(data.emailConfirmationRequired),
          ...(signupViaRef.current ? { via: signupViaRef.current } : {}),
        });
      }
      /* 귀속 소진 — 같은 탭의 다음 가입 시도에 새 프롬프트 없이 딸려가지 않게 */
      try {
        window.sessionStorage.removeItem("nz_signup_via");
      } catch {
        /* ignore */
      }
      if (data.emailConfirmationRequired) {
        setConfirmHint(data.resent ? "인증 메일 다시 보냄 · 새 링크 확인" : null);
        setResendWait(RESEND_COOLDOWN_SEC);
        setDone(true);
        return;
      }
      // 가입 직후 자동 로그인 → /welcome 온보딩으로 이동
      /* [965] 자동 로그인 결과를 본다. 예전엔 결과를 버리고 "가입이 끝났어요" 를
         띄운 뒤 /welcome 으로 보냈는데, 로그인이 안 됐으면 /welcome 이 곧장
         /login 으로 튕겨 축하 장면 뒤에 로그인 화면이 나오는 모순이 됐다.
         가입 자체는 성공했으니 로그인 화면으로 보내되 이유를 붙인다. */
      let signedIn = false;
      try {
        const res = await signIn("password", {
          email: normalizedEmail,
          password,
          redirect: false,
          callbackUrl: welcomeHref,
        });
        signedIn = Boolean(res?.ok) && !res?.error;
      } catch {
        signedIn = false;
      }
      if (!signedIn) {
        /* [970 · A-14] 로그인 화면을 거쳐도 목적지(welcomeHref)는 유지 */
        stashAuthEmail(normalizedEmail);
        router.replace(`/login?callbackUrl=${encodeURIComponent(welcomeHref)}&notice=signup_done`);
        return;
      }
      showMoment({
        title: "가입이 끝났어요",
        subtitle: "관심 지역에 맞춰 첫 화면을 준비할게요",
        kind: "celebrate",
      });
      router.replace(welcomeHref);
      router.refresh();
    } catch {
      setError("네트워크 오류 · 잠시 후 다시");
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirm() {
    if (resendBusy || resendWait > 0) return;
    setResendBusy(true);
    setConfirmHint(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizeEmail(email), resendConfirmation: true, next: welcomeHref }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;
      if (!res.ok) {
        setConfirmHint(data.error ?? "재발송 실패 · 잠시 후 다시");
        return;
      }
      setConfirmHint("인증 메일 다시 보냄 · 새 링크 확인");
      setResendWait(RESEND_COOLDOWN_SEC);
    } catch {
      setConfirmHint("네트워크 오류 · 잠시 후 다시");
    } finally {
      setResendBusy(false);
    }
  }

  if (done) {
    const sentTo = normalizeEmail(email);
    const mailbox = mailboxFor(sentTo);
    const loginAfter = `/login?callbackUrl=${encodeURIComponent(welcomeHref)}`;
    return (
      <main
        id="main-content"
        /* [968 · 31] 100vh → dvh: iOS 주소창이 보일 때 세로 가운데 정렬이 아래로 밀렸다 */
        className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-4 px-7 pb-8"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="rise-in card flex flex-col items-center gap-3 rounded-3xl p-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[21px]">
            <Icon name="✉" size={24} />
          </span>
          <h1 ref={doneTitleRef} tabIndex={-1} className="text-[19px] font-bold text-ink outline-none">
            인증 메일을 보냈어요
          </h1>
          {/* [1039] 다음에 할 일 세 칸 — 문장 두 줄 대신 순서(메일 열기 → 링크 누르기 → 로그인) */}
          <p className="break-all text-[13px] font-bold text-ink">{sentTo}</p>
          <ol className="m-0 flex w-full list-none items-start justify-between gap-1 p-0 t-caption text-text-3">
            {["메일함 열기", "인증 링크 누르기", "로그인"].map((step, i) => (
              <li key={step} className="flex flex-1 flex-col items-center gap-1">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft font-bold text-primary">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p aria-live="polite" className="min-h-[18px] t-sub font-bold text-primary">
            {confirmHint}
          </p>
          {/* 주요 행동 하나 — 아는 메일이면 메일함, 아니면 로그인 */}
          <Link
            href={mailbox ? mailbox.href : loginAfter}
            {...(mailbox ? { target: "_blank", rel: "noreferrer" } : {})}
            onClick={() => {
              if (!mailbox) stashAuthEmail(sentTo);
            }}
            className="btn-primary btn-cta w-full rounded-2xl p-[15px] text-center text-[15px]"
          >
            {mailbox ? `${mailbox.label} 열기` : "로그인하러 가기"}
          </Link>
          {mailbox && (
            <Link
              href={loginAfter}
              onClick={() => stashAuthEmail(sentTo)}
              className="w-full rounded-2xl border border-line bg-surface p-[15px] text-center text-[15px] font-bold text-ink no-underline"
            >
              인증 뒤 로그인하러 가기
            </Link>
          )}
          <button
            type="button"
            disabled={resendBusy || resendWait > 0}
            onClick={resendConfirm}
            className="inline-flex min-h-10 items-center px-3 text-[13px] font-bold text-primary disabled:text-text-3"
          >
            {resendBusy ? "보내는 중…" : resendWait > 0 ? `인증 메일 다시 보내기 · ${resendWait}초` : "인증 메일 다시 보내기"}
          </button>
          <p className="t-caption text-text-3">스팸함 확인 · 메일이 오기까지 1~2분</p>
          <div className="flex flex-wrap items-center justify-center gap-x-2">
            <button
              type="button"
              className="inline-flex min-h-10 items-center px-2 text-xs font-bold text-text-2"
              onClick={() => {
                setDone(false);
                setConfirmHint(null);
                setError(null);
              }}
            >
              다른 이메일로 다시 가입
            </button>
            <Link href="/" className="inline-flex min-h-10 items-center px-2 text-xs text-text-3">
              홈으로
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const consentRow = "-mx-2.5 flex min-h-[40px] items-center gap-3 rounded-lg px-2.5 py-1 text-xs text-text-2";
  const consentBox = "h-[20px] w-[20px] shrink-0 accent-[#1d4fd8]";
  const consentHit = "-ml-[10px] -mr-[4px] grid h-[40px] w-[40px] shrink-0 place-items-center";

  return (
    <main
      id="main-content"
      /* [968 · 31] 100vh → dvh (위 완료 화면과 같은 이유) */
      className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex items-center justify-between">
        {/* [1039] 뒤로 · 건너뛰기 — 글자만 있던 조작에 40px 손끝 칸 */}
        <Link href={loginHref} className="-ml-3 inline-flex h-10 w-10 items-center justify-center text-[15px] text-text-1" aria-label="뒤로">
          ‹
        </Link>
        {/* 진행 막대 — 예전엔 w-1/2 하드코딩이라 페이지를 열자마자 50%,
            제출 직전에도 50% 였다. 실제로 채운 항목 비율로 그린다. */}
        <div
          className="relative h-1 w-[120px] rounded-sm bg-bg"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="가입 진행률"
        >
          <div
            className="absolute left-0 top-0 h-1 rounded-sm bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <Link href="/" className="-mr-2 inline-flex min-h-10 items-center px-2 text-[13px] text-text-3">
          건너뛰기
        </Link>
      </div>

      {/* [1015 · 규칙 D] 마케팅 제목("30초면 시작할 수 있어요")·"만들어 드려요" 부제 → 명사 제목 + 사실 한 줄 */}
      {/* [1028 · 제안 5] 부제("가입 후 관심 지역·목표 선택 화면으로 이어집니다")를 지웠다 — 다음 화면 설명은 다음 화면이 한다 */}
      <h1 className="rise-in text-[21px] font-bold leading-[1.35] text-ink">
        회원가입
      </h1>

      {social.length > 0 && (
        <div className="rise-in-2 flex flex-col gap-2.5">
          {social.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => socialSignIn(provider)}
              disabled={busy || socialBusy !== null}
              className={`rounded-lg p-3.5 text-center text-[15px] font-bold disabled:opacity-60 ${SOCIAL_BUTTON[provider].className}`}
            >
              {socialBusy === provider ? "연결 중…" : SOCIAL_BUTTON[provider].label}
            </button>
          ))}
          {/* [1039] 소셜 가입에도 동의 대상을 밝힌다 — 로그인 화면과 같은 한 줄(예전: 체크 없이 통과 · 문구 없음) */}
          <p className="text-center text-[12px] leading-[1.6] text-text-3">
            소셜 가입 ={" "}
            <Link href="/legal/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              이용약관
            </Link>
            ·
            <Link href="/legal/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              개인정보처리방침
            </Link>{" "}
            동의 · 만 14세 이상
          </p>
          <div className="flex items-center gap-3 text-[12px] text-text-3">
            <span className="h-px flex-1 bg-bg" />
            또는 이메일로 가입
            <span className="h-px flex-1 bg-bg" />
          </div>
        </div>
      )}

      {/* [개선 #9] 목표 3택·관심지역 검색 블록 제거 — /welcome 온보딩이 수집한다.
          실측에서 이 두 블록 앞에서 거의 전원이 이탈했다(30일 44→1). */}
      {/* [1028 · 제안 5] 폼 머리 "계정 만들기 · 이메일로 가입"을 뺐다 — 바로 위 구분선이 "또는 이메일로 가입"이라 같은 말이 겹쳤다
          (소셜 수단이 없으면 제목 "회원가입" 아래 바로 폼) */}
      {/* [1039] noValidate — 브라우저 말풍선과 화면 오류가 섞이지 않게 검증은 화면이 한다(칸마다 표시 · 첫 오류 칸으로 초점) */}
      <form onSubmit={onSubmit} noValidate className="rise-in-5 flex flex-col gap-2">
        {/* [1039] 떠오르는 라벨(.njn-field · 로그인과 같은 꼴) — placeholder 를 이름표로 쓰던 것을 실제 보이는 <label> 로.
            [968 · 29] 키보드 힌트 — 이름·이메일은 "다음"(Enter 로 다음 칸), 비밀번호는 "완료". */}
        <div className="njn-field">
          <input
            id="signup-name"
            name="name"
            type="text"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder=" "
            autoComplete="name"
            enterKeyHint="next"
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              document.getElementById("signup-email")?.focus();
            }}
          />
          <label htmlFor="signup-name">이름 (선택)</label>
        </div>
        <div className="njn-field">
          <input
            id="signup-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldErr.email) setFieldErr((f) => ({ ...f, email: undefined }));
              if (dupEmail) setDupEmail(null);
            }}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            placeholder=" "
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            aria-required="true"
            aria-invalid={emailErr ? true : undefined}
            aria-describedby={emailErr ? "signup-email-err" : undefined}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              document.getElementById("signup-password")?.focus();
            }}
          />
          <label htmlFor="signup-email">이메일</label>
        </div>
        {emailErr && (
          <p id="signup-email-err" className="-mt-1 px-1 t-caption font-bold text-danger">
            {emailErr}
          </p>
        )}
        {/* [1039] 흔한 도메인 오타(gmial.com · naver.con …) — 한 번 눌러 고친다(인증 메일이 닿지 않는 가입을 막는다) */}
        {typoFix && !emailErr && (
          <button
            type="button"
            onClick={() => setEmail(typoFix)}
            className="-mt-1 inline-flex min-h-10 items-center self-start px-1 t-sub font-bold text-primary"
          >
            {typoFix} 로 고치기
          </button>
        )}
        <div className="njn-field relative">
          <input
            id="signup-password"
            name="password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (fieldErr.password) setFieldErr((f) => ({ ...f, password: undefined }));
            }}
            placeholder=" "
            autoComplete="new-password"
            enterKeyHint="done"
            aria-required="true"
            aria-invalid={passwordErr ? true : undefined}
            aria-describedby={passwordErr ? "signup-password-err" : "signup-password-meter"}
            style={{ paddingRight: 64 }}
          />
          <label htmlFor="signup-password">비밀번호 ({PASSWORD_MIN}자 이상)</label>
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-pressed={showPw}
            aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
            className="absolute right-1 top-1/2 inline-flex h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg px-2 text-[12px] font-bold text-text-3"
          >
            {showPw ? "숨김" : "표시"}
          </button>
        </div>
        {/* [1039] 비밀번호 강도 — 서버가 거절(유출·흔한 비밀번호)하기 전에 화면에서 먼저 보인다. 막대 4칸 + 낱말 */}
        {password.length > 0 && !passwordErr && (
          <div id="signup-password-meter" className="-mt-1 flex items-center gap-2 px-1">
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
              {password.length < PASSWORD_MIN ? `${password.length}/${PASSWORD_MIN}자` : pw.hint}
            </span>
          </div>
        )}
        {passwordErr && (
          <p id="signup-password-err" className="-mt-1 px-1 t-caption font-bold text-danger">
            {passwordErr}
          </p>
        )}

        {/* [1039] 봇 덫 — 화면 밖 · 탭 순서 밖 · 낭독기 밖. 사람은 채울 수 없다 */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
        </div>

        {/* [1039] 전체 동의 — 세 칸을 한 번에(선택 2개 포함임을 같은 줄에 적는다). 아래 칸은 따로도 고를 수 있다 */}
        <div className={`mt-1 rounded-lg border px-3 py-1 ${fieldErr.consent ? "border-danger" : "border-line"}`}>
          <label className={`${consentRow} font-bold text-ink`}>
            <span className={consentHit}>
              <input
                type="checkbox"
                checked={allAgreed}
                onChange={(e) => {
                  setAgree(e.target.checked);
                  setAgreeMarketing(e.target.checked);
                  setAgreeLocation(e.target.checked);
                  if (e.target.checked && fieldErr.consent) setFieldErr((f) => ({ ...f, consent: undefined }));
                }}
                className={consentBox}
              />
            </span>
            <span>
              전체 동의 <span className="font-medium text-text-3">· 선택 2개 포함</span>
            </span>
          </label>
          <div className="border-t border-divider" />
          {/* [991] 동의 행 = 탭 대상. 체크박스 16px 만 목표였는데(989 게이트 지적) 행 전체를
              40px 높이 + 좌우 10px 여백으로 키운다 — label 이 토글하므로 행 어디를 눌러도 된다. */}
          <label className={consentRow}>
            <span className={consentHit}>
              <input
                id="signup-agree"
                type="checkbox"
                checked={agree}
                onChange={(e) => {
                  setAgree(e.target.checked);
                  if (e.target.checked && fieldErr.consent) setFieldErr((f) => ({ ...f, consent: undefined }));
                }}
                aria-required="true"
                aria-invalid={fieldErr.consent ? true : undefined}
                aria-describedby={fieldErr.consent ? "signup-consent-err" : undefined}
                className={consentBox}
              />
            </span>
            {/* [970 · A-13] 동의 대상 문서를 그 자리에서 열 수 있게 — 링크 없는 동의는 형식뿐이다.
                <label> 안의 <a> 는 HTML 활성화 규칙상 체크박스를 토글하지 않는다(대화형 자손).
                새 탭으로 열어 작성 중인 폼을 잃지 않게 한다. */}
            <span>
              <b className="text-ink">(필수)</b>{" "}
              <Link href="/legal/terms" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                이용약관
              </Link>
              ·
              <Link href="/legal/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                개인정보처리방침
              </Link>{" "}
              동의 · 만 14세 이상
            </span>
          </label>
          <label className={consentRow}>
            <span className={consentHit}>
              <input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} className={consentBox} />
            </span>
            <span>(선택) 혜택·소식 이메일 수신 · 설정에서 언제든 철회</span>
          </label>
          <label className={consentRow}>
            <span className={consentHit}>
              <input type="checkbox" checked={agreeLocation} onChange={(e) => setAgreeLocation(e.target.checked)} className={consentBox} />
            </span>
            <span>(선택) 위치정보 이용(주변 단지·지도 편의) · 설정에서 언제든 철회</span>
          </label>
        </div>
        {fieldErr.consent && (
          <p id="signup-consent-err" className="-mt-1 px-1 t-caption font-bold text-danger">
            필수 동의 필요 · 이용약관 · 개인정보처리방침 · 만 14세 이상
          </p>
        )}

        {/* [1039] 이미 가입된 이메일 — 다음 행동 두 개를 바로 잇는다(예전: 서로 어긋나는 안내 한 문장 · 링크 없음) */}
        {dupEmail && (
          <div role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger">
            이미 가입된 이메일
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={loginHref}
                onClick={() => stashAuthEmail(dupEmail)}
                className="inline-flex min-h-10 items-center rounded-lg border border-danger/40 bg-surface px-3 text-[12px] font-bold text-danger no-underline"
              >
                이 이메일로 로그인 ›
              </Link>
              <Link
                href="/forgot-password"
                onClick={() => stashAuthEmail(dupEmail)}
                className="inline-flex min-h-10 items-center rounded-lg border border-danger/40 bg-surface px-3 text-[12px] font-bold text-danger no-underline"
              >
                비밀번호 찾기 ›
              </Link>
            </div>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-danger-soft px-4 py-3 text-[13px] font-bold text-danger"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || socialBusy !== null}
          className="btn-primary btn-cta rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
        >
          {busy ? "가입 중…" : "가입하고 노트 쓰기"}
        </button>
        <div className="text-center text-xs text-text-3">
          이미 계정이 있다면{" "}
          <Link href={loginHref} className="inline-block py-[5px] font-bold text-primary">
            로그인
          </Link>
        </div>
      </form>
    </main>
  );
}
