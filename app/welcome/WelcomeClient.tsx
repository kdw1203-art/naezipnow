"use client";

import { BrandSloganBand } from "@/app/components/BrandSloganBand";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RegionPicker } from "@/app/components/RegionPicker";
import { takeSignupHandoff } from "@/lib/onboarding/signup-handoff";
import { HOME_CTA_NOTE } from "@/lib/brand/home-copy";
import { safeInternalPath } from "@/lib/safe-path";

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
   ============================================================ */

/** 위저드 화면 진행 기록용 id — 퍼널 관측 전용 */
const STEP_ID = "profile_region" as const;

/** 관심 지역 선택 상한 — 가입 화면(/signup)과 같은 값 */
const MAX_REGIONS = 3;

export function WelcomeClient() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /* [970 · A-14] 가입 전에 하던 일(구독·페이월 등)로 돌아갈 경로 — SignupClient 가
     /welcome?next= 로 싣는다. 내부 경로만, 홈이면 없는 것으로 친다. 마운트 후에만 읽는다. */
  const [next, setNext] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get("next");
      const safe = safeInternalPath(raw, "/");
      setNext(safe === "/" ? null : safe);
    } catch {
      setNext(null);
    }
  }, []);

  /* 로그인 확인 겸 저장된 진행 상태 조회 — 401 이면 로그인으로 (소셜 포함, 로그인 후 복귀) */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/onboarding", { cache: "no-store" });
        if (res.status === 401) {
          const here = safeInternalPath(window.location.pathname + window.location.search, "/welcome");
          router.replace(`/login?callbackUrl=${encodeURIComponent(here)}`);
          return;
        }
      } catch {
        /* 네트워크 오류 시에도 온보딩 UI는 보여준다 */
      }
      if (!cancelled) setReady(true);
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

  /* 완료: 관심지역 알림 구독 + 개인화(지역만) 저장 → 첫 행동(임장노트 쓰기). 실패는 무시 —
     저장이 안 됐다고 첫 노트를 막을 이유가 없다. */
  const finish = useCallback(async () => {
    if (busy || regions.length === 0) return;
    setBusy(true);
    /* 퍼널 관측(fire-and-forget) — wizardSteps 로만 쌓인다 */
    fetch("/api/me/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: STEP_ID }),
    }).catch(() => {});

    await Promise.allSettled([
      ...regions.map((value) =>
        fetch("/api/me/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "region", value }),
        }),
      ),
      fetch("/api/me/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions, budget: null, purpose: null, persona: null, profile: {} }),
      }),
    ]).catch(() => {});

    /* [970 · A-14] 로그인 벽에서 가입으로 넘어온 사람은 하던 일(next)로 */
    if (next) {
      router.push(next);
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
  }, [busy, regions, router, next]);

  if (!ready) {
    return (
      /* [968 · 31] 100vh → dvh: iOS 주소창이 보일 때 100vh 는 실제 화면보다 커서
         가운데 정렬·아래 버튼이 주소창 뒤로 밀렸다 */
      <main className="mx-auto flex min-h-dvh w-full max-w-[440px] items-center justify-center px-7">
        <span className="text-[13px] text-text-3">준비 중…</span>
      </main>
    );
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col gap-4 px-7 pb-8"
      style={{ paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}
    >
      {/* 헤더 — 한 화면이라 단계 표시가 없다. 건너뛰기만 (항상 노출). */}
      <div className="flex items-center justify-end">
        {/* [970 · A-14] 건너뛰기도 next 가 있으면 그리로 */}
        <Link
          href={next ?? `${HOME_CTA_NOTE.href}?from=welcome&intent=ai`}
          className="inline-block py-[5px] text-[13px] text-text-3"
        >
          {next ? "건너뛰고 하던 화면으로" : "건너뛰고 노트 쓰기"}
        </Link>
      </div>

      {/* [962] 첫 화면의 첫 줄은 브랜드 — 한지 띠 위 세리프 슬로건 */}
      <BrandSloganBand className="rise-in" />
      <h1 className="rise-in text-[21px] font-extrabold leading-[1.35] text-ink">
        어느 동네가
        <br />
        궁금하세요?
      </h1>
      <p className="rise-in-1 -mt-2 text-[13px] text-text-2">
        전국 시·군·구에서 1~{MAX_REGIONS}곳 고르면 그 동네의 실거래·소식을 먼저 보여 드려요.
        나머지는 나중에 물어볼게요.
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
      <button
        type="button"
        onClick={() => void finish()}
        disabled={regions.length === 0 || busy}
        className="btn-primary btn-cta rise-in-3 rounded-2xl p-[15px] text-center text-[15px] disabled:opacity-60"
      >
        {busy
          ? "저장 중…"
          : regions.length > 0
            ? `${regions.length}곳 선택 · 첫 노트 쓰러 가기`
            : "지역을 선택해 주세요"}
      </button>
    </main>
  );
}
