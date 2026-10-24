"use client";

import { SignupSteps } from "@/app/components/auth/SignupSteps";
import { BrandSloganBand } from "@/app/components/BrandSloganBand";

import { useCallback, useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { useRouter } from "next/navigation";
import { RegionPicker } from "@/app/components/RegionPicker";
import { takeSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { HOME_CTA_NOTE } from "@/lib/brand/home-copy";
import { safeInternalPath } from "@/lib/safe-path";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { resumeLabelFor } from "@/lib/onboarding/resume";
import { clearFreshSignup, peekFreshSignup } from "@/lib/analytics/fresh-signup";

/* ============================================================
   [991] 온보딩 — 한 화면(관심 지역)만 묻는다.

   30일 실측(2026-09-12): 가입 화면 조회 179 → 가입 완료 3. 완료한 3명 앞에는
   다시 다섯 화면(지역 → 예산 → 목적 → 페르소나 → 기본 정보)이 서 있었다.
   예산·목적·페르소나·기본 정보는 첫 노트를 쓰기 **전**에는 답할 이유가 없는
   질문이다 — 그 값들이 바꾸는 것(홈 개인화·추천 가중치)은 노트가 한 건도
   없는 계정에서는 보이지도 않는다. 관심 지역 하나만 받고 바로 첫 행동으로 간다.
   나머지는 /my/settings 와 첫 노트 작성 화면이 그때 묻는다.

   진짜 온보딩 스텝(explore·inspection·share)은 서버가 실데이터로 판정한다
   (app/api/me/onboarding/verify.ts) — 여기서 그 id 를 보내지 않는다.
   완주 보너스(200P)도 그쪽이 지급하므로 이 축소로 포인트 규칙은 바뀌지 않는다.

   [1058] 재진입("관심지역 수정" — 홈 미니맵·참여 카드가 /welcome 으로 보낸다).
   예전엔 (1) 빈 칸으로 시작해 이미 고른 지역을 모르고, (2) 끝내면 budget·purpose·persona 를 null 로
   POST 해 저장소가 jsonb 를 통째로 덮어쓰고(설정값 삭제), (3) 가입 3단계 띠를 그리고, (4) /notes/new 로 보냈다.
   이제 GET /api/me/preferences 로 지금 지역을 받아 채우고, 지역만 보내며(서버는 non-null 키만 합친다),
   지역이 이미 있는 사람에겐 띠를 숨기고, 저장 뒤 next(기본 /my)로 돌아간다. 저장 실패는 503 — 머문다.
   ============================================================ */

/** 위저드 화면 진행 기록용 id — 퍼널 관측 전용 */
const STEP_ID = "profile_region" as const;

/** 관심 지역 선택 상한 — 가입 화면(/signup)과 같은 값 */
const MAX_REGIONS = 3;

export function WelcomeClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  /* [1058] 재진입 — 서버에 관심 지역이 이미 있는 사람. 판정 전엔 null(가입 띠를 먼저 그리지 않는다) */
  const [reentry, setReentry] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* [970 · A-14] 가입 전에 하던 일(구독·페이월 등)로 돌아갈 경로 — SignupClient 가
     /welcome?next= 로 싣는다. 내부 경로만. [1058] 홈("/")도 그대로 둔다 — 재진입은 홈에서 온다. 마운트 후에만 읽는다. */
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("next");
      const safe = safeInternalPath(raw, "");
      setNext(safe || null);
    } catch {
      setNext(null);
    }
  }, []);

  /* 로그인 확인 겸 저장된 진행 상태 조회 — 401 이면 로그인으로 (소셜 포함, 로그인 후 복귀)
     [1058] 지금 관심 지역도 같이 받는다(GET /api/me/preferences → personalization.regions) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: string[] = [];
      try {
        const [res, prefs] = await Promise.all([
          fetch("/api/me/onboarding", { cache: "no-store" }),
          fetch("/api/me/preferences", { cache: "no-store" }).catch(() => null),
        ]);
        if (res.status === 401) {
          const here = safeInternalPath(window.location.pathname + window.location.search, "/welcome");
          router.replace(`/login?callbackUrl=${encodeURIComponent(here)}`);
          return;
        }
        if (prefs?.ok) {
          const data = (await prefs.json().catch(() => null)) as {
            personalization?: { regions?: unknown } | null;
          } | null;
          const list = data?.personalization?.regions;
          if (Array.isArray(list)) {
            saved = list.filter((v): v is string => typeof v === "string" && v.trim() !== "").slice(0, MAX_REGIONS);
          }
        }
      } catch {
        /* 네트워크 오류 시에도 온보딩 UI는 보여준다 */
      }
      if (!cancelled) {
        setReentry(saved.length > 0);
        /* 저장된 지역이 있으면 그것으로 채운다 — 가입 화면에서 넘어온 값(아래 handoff)이 있으면 그쪽이 덮는다 */
        if (saved.length > 0) setRegions((cur) => (cur.length > 0 ? cur : saved));
        setReady(true);
        /* [1039] 온보딩 관측 — 화면이 열린 수(로그인 확인 뒤 1회). 완료·건너뛰기와 견줘 이탈을 본다
           [1086 · A8] 방금 가입한 브라우저면 방법(password·google·kakao·toss)을 싣는다 — 소셜 가입은 가입 화면이 완료를 셀 수 없었다 */
        const fresh = peekFreshSignup();
        trackPlatformEvent({ eventName: "welcome_view", source: "welcome", campaign: "funnel", metadata: { funnel: "signup", reentry: saved.length > 0, fresh: fresh?.method ?? null } });
        if (fresh && fresh.method !== "password") {
          trackPlatformEvent({ eventName: "signup_social_return", source: "welcome", campaign: "funnel", metadata: { method: fresh.method, reentry: saved.length > 0 } });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  /* 가입 화면에서 이미 고른 값을 그대로 이어받는다 — 같은 질문을 두 번 받지 않는다. */
  useEffect(() => {
    const carried = takeSignupHandoff();
    if (carried.regions.length > 0) setRegions(carried.regions.slice(0, MAX_REGIONS));
  }, []);

  /* 가입 흐름의 다음 화면 — next 가 홈이면 없는 것으로 친다(첫 노트로). 재진입은 next(기본 /my)로 */
  const signupNext = next && next !== "/" ? next : null;
  const returnTo = next ?? "/my";
  /* [1086 · A2] 가입 창(노트 저장·관심 단지 등)에서 넘어온 사람 — 지역을 안 골라도 하던 화면으로 간다(예전엔 지역 1곳이 필수였고,
     단추 이름이 "첫 노트 쓰러 가기"라 하던 일로 돌아가는 단추인지 알 수 없었다). 이어서 할 일을 사실 낱말로 보여 준다 */
  const resuming = !reentry && signupNext != null;
  const resumeLabel = resuming ? resumeLabelFor(signupNext) : null;

  /* 완료: 관심지역 알림 구독 + 개인화(지역만) 저장 → 첫 행동(임장노트 쓰기). 가입 흐름의 실패는 무시 —
     저장이 안 됐다고 첫 노트를 막을 이유가 없다. [1058] 재진입은 저장 결과를 본다 — 실패면 머문다. */
  const finish = useCallback(async () => {
    if (busy) return;
    /* [1086 · A2] 지역 없이 끝내기는 하던 화면으로 돌아가는 사람만 — 지역은 나중에 마이 › 설정에서 */
    if (regions.length === 0) {
      if (!resuming || !signupNext) return;
      trackPlatformEvent({ eventName: "welcome_finish", source: "welcome", campaign: "funnel", metadata: { funnel: "signup", regions: 0, reentry: false, resume: true } });
      clearFreshSignup();
      router.push(signupNext);
      return;
    }
    setBusy(true);
    setSaveError(null);
    trackPlatformEvent({ eventName: "welcome_finish", source: "welcome", campaign: "funnel", metadata: { funnel: "signup", regions: regions.length, reentry: reentry === true, resume: resuming } });
    clearFreshSignup();
    /* 퍼널 관측(fire-and-forget) — wizardSteps 로만 쌓인다 */
    fetch("/api/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: STEP_ID }),
    }).catch(() => {});

    const [prefRes] = await Promise.all([
      /* [1058] 지역만 보낸다 — budget·purpose·persona 를 null 로 보내던 것이 설정값을 지웠다(서버도 이제 non-null 키만 합친다) */
      fetch("/api/me/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions }),
      }).catch((): Response | null => null),
      Promise.allSettled(
        regions.map((value) =>
          fetch("/api/me/alerts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "region", value }),
          }),
        ),
      ),
    ]);

    if (reentry) {
      /* 재진입 — POST 결과(503 = 저장 실패)를 본다. 알림 구독은 알림함에서 따로 관리한다 */
      if (!prefRes || !prefRes.ok) {
        setSaveError("관심 지역 저장 실패 · 잠시 후 다시");
        setBusy(false);
        return;
      }
      router.push(returnTo);
      return;
    }

    /* [970 · A-14] 로그인 벽에서 가입으로 넘어온 사람은 하던 일(next)로 */
    if (signupNext) {
      router.push(signupNext);
      return;
    }
    // 종착지: 첫 임장노트(+ AI 의도) — NoteForm 이 from=welcome 이면 저장 후 지도로 이어간다.
    const qs = new URLSearchParams({ from: "welcome", intent: "ai" });
    if (regions[0]) qs.set("region", regions[0]);
    try {
      window.localStorage.setItem("nz_onboarding_loop", "note");
    } catch {
      /* ignore */
    }
    router.push(`/notes/new?${qs.toString()}`);
  }, [busy, regions, router, reentry, returnTo, signupNext, resuming]);

  if (!ready) {
    return (
      /* [968 · 31] 100vh → dvh: iOS 주소창이 보일 때 100vh 는 실제 화면보다 커서
         가운데 정렬·아래 버튼이 주소창 뒤로 밀렸다 */
      <main className="mx-auto flex min-h-dvh w-full max-w-[440px] items-center justify-center px-7">
        <span className="t-body text-text-3">준비 중…</span>
      </main>
    );
  }

  const skipHref = reentry ? returnTo : (signupNext ?? `${HOME_CTA_NOTE.href}?from=welcome&intent=ai`);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      {/* 헤더 — 건너뛰기(항상 노출). [1040] 가입 3단계의 마지막 칸(관심 지역) — 가입 폼·인증 메일 안내와 같은 띠.
          [1058] 지역이 이미 있는 사람(재진입)에게 "가입 3단계 중 3단계"는 사실이 아니다 — 숨긴다 */}
      {!reentry && <SignupSteps current={2} className="rise-in" />}
      {/* [1086 · A2] 하던 화면으로 돌아가는 사람은 아래 주 단추가 그 길이다(지역 없이도 열린다) — 건너뛰기 링크를 두 벌 두지 않는다 */}
      <div className={`flex items-center justify-end ${resuming ? "hidden" : ""}`}>
        {/* [970 · A-14] 건너뛰기도 next 가 있으면 그리로 */}
        <Link
          href={skipHref}
          onClick={() => trackPlatformEvent({ eventName: "welcome_skip", source: "welcome", campaign: "funnel", metadata: { funnel: "signup", reentry: reentry === true } })}
          className="inline-flex min-h-10 items-center px-2 t-body text-text-3"
        >
          {reentry ? "변경 없이 돌아가기" : signupNext ? "건너뛰고 하던 화면으로" : "건너뛰고 노트 쓰기"}
        </Link>
      </div>

      {/* [962] 첫 화면의 첫 줄은 브랜드 — 한지 띠 위 세리프 슬로건 */}
      <BrandSloganBand className="rise-in" />
      {resumeLabel && (
        <div className="rise-in card flex flex-col gap-0.5 rounded-2xl px-4 py-3">
          <span className="t-caption font-bold text-primary">가입 완료 · 이어서 할 일</span>
          <span className="t-body font-bold text-ink">{resumeLabel}</span>
        </div>
      )}
      <h1 className="rise-in t-title font-bold leading-[1.35] text-ink">
        {reentry ? "관심 지역 수정" : "관심 지역 선택"}
      </h1>
      <p className="rise-in-1 -mt-2 t-body text-text-2">
        {resuming
          ? `선택 사항 · 전국 시·군·구에서 1~${MAX_REGIONS}곳. 나중에 마이 › 설정에서도 고를 수 있습니다.`
          : `전국 시·군·구에서 1~${MAX_REGIONS}곳. 고른 동네의 실거래·소식이 먼저 보입니다.`}
      </p>
      <div className="rise-in-2">
        <RegionPicker
          inputId="welcome-region-search"
          value={regions}
          onChange={setRegions}
          max={MAX_REGIONS}
        />
      </div>
      <div className="flex-1" />
      {saveError && (
        <p role="alert" className="t-sub font-bold text-danger">
          {saveError}
        </p>
      )}
      <button
        type="button"
        onClick={() => void finish()}
        disabled={(regions.length === 0 && !resuming) || busy}
        className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
      >
        {busy
          ? "저장 중…"
          : resuming
            ? regions.length > 0
              ? `${regions.length}곳 저장 · 하던 화면으로`
              : "하던 화면으로"
            : regions.length > 0
              ? reentry
                ? `${regions.length}곳 저장`
                : `${regions.length}곳 선택 · 첫 노트 쓰러 가기`
              : "지역을 선택해 주세요"}
      </button>
    </main>
  );
}
