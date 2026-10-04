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
  const [agree, setAgree] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [agreeLocation, setAgreeLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"done" | "confirm" | null>(null);
  const [confirmHint, setConfirmHint] = useState<string | null>(null);
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

  const progressDone = [
    email.trim().includes("@"),
    password.length >= 8,
    agree,
  ].filter(Boolean).length;
  const progressPct = Math.round((progressDone / 3) * 100);

  async function socialSignIn(provider: SocialProvider) {
    setError(null);
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
      setError("소셜 가입에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setSocialBusy(null);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    trackStep("signup_step_4");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      setError("올바른 이메일을 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!agree) {
      setError("이용약관·개인정보처리방침·만 14세 이상에 동의해 주세요.");
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
          name: name.trim(),
          source: signupViaRef.current ? "soft_signup" : "onboarding_signup",
          campaign: signupViaRef.current?.replace(/^soft:/, "") || "default",
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
          setError(
            "이미 가입된 이메일입니다. 로그인하거나, 인증 전이라면 같은 정보로 다시 가입하면 인증 메일을 다시 받을 수 있어요.",
          );
          return;
        }
        const detail = data.detail ? ` (${data.detail})` : "";
        setError(`${data.error ?? "가입에 실패했습니다."}${detail}`);
        return;
      }
      trackStep("signup_complete", {
        emailConfirmationRequired: Boolean(data.emailConfirmationRequired),
        ...(signupViaRef.current ? { via: signupViaRef.current } : {}),
      });
      /* 귀속 소진 — 같은 탭의 다음 가입 시도에 새 프롬프트 없이 딸려가지 않게 */
      try {
        window.sessionStorage.removeItem("nz_signup_via");
      } catch {
        /* ignore */
      }
      if (data.emailConfirmationRequired) {
        setConfirmHint(
          data.message ??
            (data.resent
              ? "인증 메일을 다시 보냈습니다. 메일함의 새 링크를 확인해 주세요."
              : null),
        );
        setDone("confirm");
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
        router.replace(
          `/login?callbackUrl=${encodeURIComponent(welcomeHref)}&email=${encodeURIComponent(normalizedEmail)}&notice=signup_done`,
        );
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
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main
        /* [968 · 31] 100vh → dvh: iOS 주소창이 보일 때 세로 가운데 정렬이 아래로 밀렸다 */
        className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-4 px-7 pb-8"
        style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="rise-in card flex flex-col items-center gap-3 rounded-3xl p-7 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-[21px]">
            {done === "confirm" ? <Icon name="✉" size={24} /> : "✓"}
          </span>
          <h1 className="text-[19px] font-bold text-ink">
            {done === "confirm" ? "인증 메일을 보냈어요" : "가입이 완료됐어요"}
          </h1>
          <p className="text-[13px] leading-[1.6] text-text-2">
            {done === "confirm" ? (
              <>
                <b className="text-ink">{email.trim().toLowerCase()}</b>로 인증 메일을 보냈습니다.
                <br />
                메일의 링크를 확인한 뒤 로그인해 주세요.
                {confirmHint ? (
                  <>
                    <br />
                    <span className="mt-1 block font-bold text-primary">{confirmHint}</span>
                  </>
                ) : null}
              </>
            ) : (
              <>이제 방금 만든 계정으로 로그인하면 맞춤 지표와 체크리스트가 준비됩니다.</>
            )}
          </p>
          {done === "confirm" ? (
            <button
              type="button"
              disabled={resendBusy}
              onClick={async () => {
                setResendBusy(true);
                setConfirmHint(null);
                try {
                  const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: email.trim().toLowerCase(),
                      password,
                      name: name.trim(),
                      resendConfirmation: true,
                    }),
                  });
                  const data = (await res.json().catch(() => ({}))) as RegisterResponse;
                  if (!res.ok) {
                    setConfirmHint(data.error ?? "재발송에 실패했습니다. 잠시 후 다시 시도해 주세요.");
                    return;
                  }
                  setConfirmHint(
                    data.message ?? "인증 메일을 다시 보냈습니다. 메일함의 새 링크를 확인해 주세요.",
                  );
                } catch {
                  setConfirmHint("네트워크 오류가 발생했습니다.");
                } finally {
                  setResendBusy(false);
                }
              }}
              className="w-full rounded-2xl border border-line bg-surface p-[15px] text-center text-[15px] font-bold text-ink disabled:opacity-60"
            >
              {resendBusy ? "보내는 중…" : "인증 메일 다시 보내기"}
            </button>
          ) : null}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(welcomeHref)}`}
            className="btn-primary btn-cta mt-1 w-full rounded-2xl p-[15px] text-center text-[15px]"
          >
            로그인하러 가기
          </Link>
          <button
            type="button"
            className="text-xs font-bold text-primary"
            onClick={() => {
              setDone(null);
              setConfirmHint(null);
              setError(null);
            }}
          >
            다른 이메일로 다시 가입
          </button>
          <Link href="/" className="text-xs text-text-3">
            나중에 할게요 · 홈으로
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      /* [968 · 31] 100vh → dvh (위 완료 화면과 같은 이유) */
      className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      <div className="flex items-center justify-between">
        <Link href={loginHref} className="text-[15px] text-text-1" aria-label="뒤로">
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
        <Link href="/" className="text-[13px] text-text-3">
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
      <form onSubmit={onSubmit} className="rise-in-5 flex flex-col gap-2">
        {/* 항목 47 — sr-only 라벨 + id (placeholder 는 접근 가능한 이름이 아니다) */}
        <label htmlFor="signup-name" className="sr-only">
          이름 (선택)
        </label>
        {/* [968 · 29] 키보드 힌트 — 이름·이메일은 "다음"(Enter 로 다음 칸), 비밀번호는 "완료".
            힌트만 붙이면 Enter 가 폼을 바로 제출하므로 앞 두 칸의 Enter 는 포커스 이동으로. */}
        <input
          id="signup-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름 (선택)"
          autoComplete="name"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            document.getElementById("signup-email")?.focus();
          }}
          className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink outline-none focus:border-primary"
        />
        <label htmlFor="signup-email" className="sr-only">
          이메일
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            document.getElementById("signup-password")?.focus();
          }}
          className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-ink outline-none focus:border-primary"
        />
        <label htmlFor="signup-password" className="sr-only">
          비밀번호 (8자 이상)
        </label>
        <div className="relative">
          <input
            id="signup-password"
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (8자 이상)"
            autoComplete="new-password"
            enterKeyHint="done"
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 pr-14 text-[13px] text-ink outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-pressed={showPw}
            aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 표시"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[12px] font-bold text-text-3"
          >
            {showPw ? "숨김" : "표시"}
          </button>
        </div>
        {/* [991] 동의 행 = 탭 대상. 체크박스 16px 만 목표였는데(989 게이트 지적) 행 전체를
            40px 높이 + 좌우 10px 여백으로 키운다 — label 이 토글하므로 행 어디를 눌러도 된다. */}
        <label className="-mx-2.5 flex min-h-[40px] items-center gap-3 rounded-lg px-2.5 py-1 text-xs text-text-2">
          <span className="-ml-[10px] -mr-[4px] grid h-[40px] w-[40px] shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="h-[20px] w-[20px] shrink-0 accent-[#1d4fd8]"
            />
          </span>
          {/* [970 · A-13] 동의 대상 문서를 그 자리에서 열 수 있게 — 링크 없는 동의는 형식뿐이다.
              <label> 안의 <a> 는 HTML 활성화 규칙상 체크박스를 토글하지 않는다(대화형 자손).
              새 탭으로 열어 작성 중인 폼을 잃지 않게 한다. */}
          <span>
            <b className="text-ink">(필수)</b>{" "}
            <Link
              href="/legal/terms"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              이용약관
            </Link>
            ·
            <Link
              href="/legal/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              개인정보처리방침
            </Link>
            에 동의하며 만 14세 이상입니다
          </span>
        </label>
        <label className="-mx-2.5 flex min-h-[40px] items-center gap-3 rounded-lg px-2.5 py-1 text-xs text-text-2">
          <span className="-ml-[10px] -mr-[4px] grid h-[40px] w-[40px] shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={agreeMarketing}
              onChange={(e) => setAgreeMarketing(e.target.checked)}
              className="h-[20px] w-[20px] shrink-0 accent-[#1d4fd8]"
            />
          </span>
          <span>
            (선택) 혜택·소식 이메일 수신 · 설정에서 언제든 철회
          </span>
        </label>
        <label className="-mx-2.5 flex min-h-[40px] items-center gap-3 rounded-lg px-2.5 py-1 text-xs text-text-2">
          <span className="-ml-[10px] -mr-[4px] grid h-[40px] w-[40px] shrink-0 place-items-center">
            <input
              type="checkbox"
              checked={agreeLocation}
              onChange={(e) => setAgreeLocation(e.target.checked)}
              className="h-[20px] w-[20px] shrink-0 accent-[#1d4fd8]"
            />
          </span>
          <span>
            (선택) 위치정보 이용(주변 단지·지도 편의) · 설정에서 언제든 철회
          </span>
        </label>

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
          disabled={busy}
          className="btn-primary btn-cta rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
        >
          {busy ? "가입 중…" : "가입하고 노트 쓰기"}
        </button>
        <div className="text-center text-xs text-text-3">
          이미 계정이 있다면{" "}
          <Link href={loginHref} className="font-bold text-primary">
            로그인
          </Link>
        </div>
      </form>
    </main>
  );
}
