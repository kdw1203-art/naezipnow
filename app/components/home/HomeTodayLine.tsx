"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHomePersonal } from "@/lib/client/home-personal";
import { useShellActive, type Shell } from "@/lib/client/viewport-shell";
import type { KpiRegion, KpiTemp } from "./HomeKpiRow";

/* ============================================================
   오늘의 한 줄 — 배너형 회전. (A03·A15 + 소유자 지시 2026-08-26)

   1차로 "가장 큰 변화 하나"만 문장으로 뽑았는데, 소유자 요청으로 **여러 문구가
   탭을 넘기며 보이는 배너**가 됐다. 원칙은 그대로다 — 한 번에 **한 문장만**
   보인다. 넷을 동시에 늘어놓지 않는 것이 이 화면의 요점이었고, 회전은 그 원칙을
   깨지 않으면서 담을 수 있는 사실을 늘린다.

   지키는 것:
     · 지어내지 않는다 — 값이 없는 슬라이드는 아예 만들지 않는다.
     · 슬라이드가 하나뿐이면 점·자동넘김을 그리지 않는다(가짜 캐러셀 금지).
     · prefers-reduced-motion 이면 자동으로 넘기지 않는다.
     · 손이 올라가 있거나 포커스가 안에 있으면 멈춘다 — 읽는 중에 사라지지 않게.
     · 점은 진짜 탭이다(role=tab) — 눌러서 바로 그 문장으로 간다.
   ============================================================ */

type Personal = {
  primaryRegion: string | null;
  regionMarket: {
    name: string;
    price: string;
    delta: string;
    tone: KpiRegion["tone"];
    meta: string;
  } | null;
};

type Slide = { key: string; text: string; href: string };

const ROTATE_MS = 9000; // [950] 6→9초: 한 문장을 읽기 전에 넘어간다는 지적
/* [968 · 38] 손을 떼거나 포커스가 나간 뒤 이만큼은 더 멈춰 있는다 — 탭한 직후 바로
   문장이 바뀌면 "내가 누른 게 뭐였지"가 된다. 3초면 방금 읽던 문장을 마저 읽는다. */
const RESUME_GRACE_MS = 3000;

function regionSentence(r: KpiRegion): string {
  const d = r.delta.replace(/[▲▼]/g, "").trim();
  /* [950] 기준월을 문장에 적는다 — "지난달보다"만 있으면 9월에 읽는 사람은 8월 대비로
     오해한다(스냅샷은 7월 지수). 숫자의 시점은 숫자의 일부다. */
  const when = r.periodLabel ? `${r.periodLabel} ` : "";
  const vs = r.periodLabel ? "전월보다" : "지난달보다";
  if (r.tone === "up") return `${r.name} ${when}아파트 평균이 ${r.price}, ${vs} ${d} 올랐어요.`;
  if (r.tone === "down") return `${r.name} ${when}아파트 평균이 ${r.price}, ${vs} ${d} 내렸어요.`;
  return `${r.name} ${when}아파트 평균은 ${r.price}, 전월과 비슷해요.`;
}

export function HomeTodayLine({
  region,
  temp,
  saleIndex,
  baseRate,
  loanRate,
  publicNotes,
  shell,
}: {
  region: KpiRegion | null;
  temp: KpiTemp | null;
  saleIndex?: string | null;
  baseRate?: string | null;
  loanRate?: string | null;
  publicNotes?: number | null;
  /** [968 · 8] 어느 벌인지 — 안 보이는 벌은 개인화 조회·회전 타이머를 시작하지 않는다 */
  shell?: Shell;
}) {
  const active = useShellActive(shell);
  /* 서버는 대표 지역으로 그린다(ISR 캐시 유지). 로그인 사용자는 붙은 뒤
     자기 관심지역으로 바뀐다 — 개인 정보가 공유 캐시에 섞이지 않게. */
  const [mine, setMine] = useState<Personal | null>(null);
  useEffect(() => {
    if (!active) return;
    let dead = false;
    getHomePersonal<Personal>()
      .then((j) => {
        if (!dead && j) setMine(j);
      })
      .catch(() => {
        /* 개인화 실패는 홈을 죽일 이유가 아니다 — 대표 지역 그대로 둔다. */
      });
    return () => {
      dead = true;
    };
  }, [active]);

  const personalized = Boolean(mine?.primaryRegion && mine?.regionMarket);
  const shown: KpiRegion | null = personalized
    ? {
        name: mine!.regionMarket!.name,
        price: mine!.regionMarket!.price,
        delta: mine!.regionMarket!.delta,
        tone: mine!.regionMarket!.tone,
        tradeLabel: mine!.regionMarket!.meta.match(/([\d,]+건)/)?.[1] ?? null,
        href: `/map?region=${encodeURIComponent(mine!.regionMarket!.name)}`,
      }
    : region;

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    if (shown) out.push({ key: "region", text: regionSentence(shown), href: shown.href });
    if (temp)
      out.push({
        key: "temp",
        text: `이번 주 시장 온도는 ${temp.score}점이에요. ${temp.headline}`,
        href: "/analysis/temperature",
      });
    if (shown?.tradeLabel)
      out.push({
        key: "trade",
        text: `${shown.name}에서 최근 ${shown.tradeLabel}이 신고됐어요.`,
        href: "/analysis/price",
      });
    if (saleIndex && saleIndex !== "—")
      out.push({
        key: "index",
        text: `서울 매매지수는 ${saleIndex}입니다. 12개월 흐름을 볼까요?`,
        href: "/analysis/timing",
      });
    if (baseRate && baseRate !== "—")
      out.push({
        key: "rate",
        text: `기준금리는 ${baseRate}${loanRate ? `, 주담대 변동은 ${loanRate}` : ""}예요.`,
        href: "/analysis/scenario",
      });
    if (typeof publicNotes === "number" && publicNotes > 0)
      out.push({
        key: "notes",
        text: `지금까지 공개된 임장노트가 ${publicNotes.toLocaleString("ko-KR")}건 쌓였어요.`,
        href: "/notes",
      });
    return out;
  }, [shown, temp, saleIndex, baseRate, loanRate, publicNotes]);

  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);

  /* 슬라이드 수가 줄어드는 경우(개인화로 항목이 빠질 때) 범위를 벗어나지 않게 */
  useEffect(() => {
    if (i >= slides.length) setI(0);
  }, [slides.length, i]);

  useEffect(() => {
    /* [968 · 8] 안 보이는 벌은 돌리지 않는다 — 폰에서 9초 인터벌 2개 → 1개 */
    if (!active || slides.length < 2 || paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // 자동 전환을 원치 않는 설정 — 점으로만 넘긴다
    }
    const t = window.setInterval(() => setI((v) => (v + 1) % slides.length), ROTATE_MS);
    return () => window.clearInterval(t);
  }, [active, slides.length, paused]);

  /* [968 · 38] 멈춤/재개 — 손이 닿거나(pointerdown·touchstart) 포커스가 들어오면 즉시
     멈추고, 떼거나 나가면 RESUME_GRACE_MS 뒤에 다시 돈다. 예전엔 hover·focus 만
     멈췄는데 터치 화면엔 hover 가 없다 — 읽으려고 손을 댄 순간 문장이 바뀌었다. */
  const graceRef = useRef<number | null>(null);
  const hold = useCallback(() => {
    if (graceRef.current !== null) {
      window.clearTimeout(graceRef.current);
      graceRef.current = null;
    }
    setPaused(true);
  }, []);
  const release = useCallback(() => {
    if (graceRef.current !== null) window.clearTimeout(graceRef.current);
    graceRef.current = window.setTimeout(() => {
      graceRef.current = null;
      setPaused(false);
    }, RESUME_GRACE_MS);
  }, []);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !active) return;
    /* touchstart 는 passive 로 — 스크롤을 막지 않는다(React 프롭은 passive 보장이 없다) */
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    return () => {
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      if (graceRef.current !== null) window.clearTimeout(graceRef.current);
    };
  }, [active, hold, release]);

  const go = useCallback(
    (next: number) => {
      if (slides.length === 0) return;
      setI(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  if (slides.length === 0) return null;
  const cur = slides[Math.min(i, slides.length - 1)];

  return (
    <section
      ref={rootRef}
      aria-labelledby="home-today"
      aria-roledescription="배너"
      /* [946 리브랜딩 · 홈 프리뷰 ③] 흰 카드 → 딥 네이비 + 심볼 워터마크.
         글자는 한지색 — #F6F1E7 on #0B2545 ≈ 14:1. */
      className="brand-navy-card overflow-hidden rounded-2xl px-[18px] py-4"
      onMouseEnter={hold}
      onMouseLeave={release}
      /* [968 · 38] 포인터(마우스·펜·터치 공통)와 포커스 — 닿으면 멈춤, 떼면 3초 뒤 재개 */
      onPointerDown={hold}
      onPointerUp={release}
      onPointerCancel={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(i + 1);
        if (e.key === "ArrowLeft") go(i - 1);
      }}
    >
      {/* 심볼 워터마크 — 처마+온점 한지색, 장식(aria-hidden) */}
      <svg
        className="brand-wm"
        width="150"
        height="140"
        viewBox="0 0 120 120"
        aria-hidden="true"
      >
        <path
          d="M14 46 C 38 64, 82 64, 106 46"
          fill="none"
          stroke="#F6F1E7"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="60" cy="86" r="8.5" fill="#F6F1E7" />
      </svg>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="home-today" className="t-sub font-extrabold" style={{ color: "var(--on-dark-muted)" }}>
          오늘의 한 줄
        </h2>
        {/* 근거 배지 — 이 지역이 어디서 왔는지 밝힌다. 없으면 사용자는
            자기 지역이라고 오해하거나 "왜 강남?" 에서 멈춘다. */}
        <span
          className="rounded-md px-1.5 py-px t-caption font-extrabold"
          style={
            personalized
              ? { background: "rgba(246,241,231,.16)", color: "#F6F1E7" }
              : { background: "rgba(246,241,231,.1)", color: "#9FB2CC" }
          }
        >
          {personalized ? "내 관심지역" : "대표 지역"}
        </span>
        {!personalized && (
          <Link
            href="/my/settings#region"
            className="tap-line ml-auto t-sub font-bold no-underline"
            style={{ color: "var(--ai-accent)" }}
          >
            내 지역으로 바꾸기 ›
          </Link>
        )}
      </div>

      {/* 문장 — 높이를 두 줄로 잡아 두어 넘길 때 아래가 밀리지 않는다(CLS) */}
      <Link
        key={cur.key}
        href={cur.href}
        /* 두 줄 높이를 미리 잡아 둔다 — 문장 길이가 바뀔 때 아래 카드가 밀리지 않게(CLS).
           짧은 문장에서 아래가 비어 보이지만, 넘길 때마다 화면이 튀는 쪽이 훨씬 나쁘다. */
        className="today-slide mt-1.5 block min-h-[2.9em] t-title no-underline md:min-h-[2.1em]"
        style={{ color: "var(--on-dark)" }}
      >
        {cur.text}
      </Link>

      {/* [989] 점 자체가 버튼이라 히트가 8×8 이었다. 44px 히트를 얹어 봐야 점 사이가
          6px 이라 셋이 통째로 겹쳐 한 점만 눌린다 — 넓히는 게 아니라 **버튼을 키운다**.
          점(그림)은 안쪽 span 으로 내리고 버튼은 24px 정사각으로. 줄이 위아래로
          8px 씩 자라는 만큼 -my-2 로 되돌려 배치는 그대로 둔다. */}
      {slides.length > 1 && (
        <div role="tablist" aria-label="오늘의 한 줄 넘기기" className="-my-2 mt-0.5 flex items-center gap-1.5">
          {slides.map((s, n) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={n === i}
              aria-label={`${n + 1}번째 소식`}
              onClick={() => go(n)}
              className="flex items-center justify-center p-2 transition-opacity duration-200 hover:opacity-80"
            >
              {/* 비활성 점이 6px·연한 회색이라 흰 카드 위에서 거의 안 보였다 —
                  지름을 키우고 대비를 올린다. 몇 개인지 세어질 만큼은 보여야 한다.
                  [946] 활성 점 = 브랜드 주홍(어두운 배경용 E0563A · 네이비 위 3.2:1) */}
              <span
                className="block h-2 rounded-full transition-all duration-200"
                style={{
                  width: n === i ? 20 : 8,
                  background: n === i ? "var(--brand-red-on-dark)" : "#F6F1E7",
                  opacity: n === i ? 1 : 0.42,
                }}
              />
            </button>
          ))}
          <span className="ml-auto t-caption" style={{ color: "var(--on-dark-muted)" }}>
            {i + 1}/{slides.length}
          </span>
        </div>
      )}
    </section>
  );
}
