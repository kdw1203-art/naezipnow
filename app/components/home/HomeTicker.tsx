"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useShellActive, type Shell } from "@/lib/client/viewport-shell";

/* 홈 리디자인(#408) 시안 A — 시세 티커 밴드 (잉크 네이비).
 *
 * 사실 우선: 항목은 전부 실측값이고, 조회에 실패한 항목은 **빠진다**(가짜
 * 숫자로 채우지 않는다). 항목이 하나도 없으면 밴드 자체를 그리지 않는다.
 *
 * 2026-08-17 개선(홈 비판 대응):
 * - 항목 링크화 — 숫자에 "그래서 뭐?"가 없다는 지적. 기준금리→시나리오,
 *   온도→온도 기록처럼 해석 페이지로 잇는다(href 없는 항목은 그대로 텍스트).
 * - 가독성 — 11px/55% 라벨이 저시력·고령 사용자에게 부담: 12px/70%로.
 *
 * 모션: CSS 마퀴(트랙 2벌 복제 + translateX -50%). prefers-reduced-motion
 * 에서는 애니메이션을 끄고 가로 스크롤로 대체한다(globals.css 8f 등록).
 *
 * [968 · 38] 움직이는 콘텐츠를 멈출 수단.
 * - 예전엔 `:hover` 만 멈췄다 — 터치 화면엔 hover 가 없어서 읽으려는 숫자가 손 밑에서
 *   지나갔다. 이제 손이 닿거나(pointerdown·touchstart) 포커스가 들어오면 멈추고, 떼면
 *   3초 뒤 다시 흐른다.
 * - 거친 포인터(폰·태블릿)나 감속 모션 설정이면 **기본이 정지 레일**(가로 스크롤)이다.
 *   서버 HTML 은 마퀴로 나가고(캐시·SEO 그대로) 마운트 뒤 판정해 바꾼다 — 높이가 같아
 *   화면이 밀리지 않는다.
 * - 작은 "일시정지/재생" 토글(aria-pressed) 을 띠 오른쪽에 둔다. 감속 모션 설정에선
 *   재생이 불가능하므로 토글을 그리지 않는다.
 * - 서버 컴포넌트였던 것을 클라이언트로 내렸다. 홈은 이 띠를 두 벌 그리므로
 *   `shell` 로 안 보이는 벌은 matchMedia 판정·리스너를 건너뛴다.
 */

export interface TickerItem {
  label: string;
  value: string;
  /** "up" = 파랑 강조, "down" = 붉은 강조 */
  tone?: "up" | "down" | "flat";
  /** 해석 페이지 — 있으면 항목 전체가 링크가 된다 */
  href?: string;
  /** 위계. (A15)
   *  region = 지역 시세(이 티커의 주인공) · macro = 기준금리·지수 같은 배경 지표.
   *  예전에는 전부 같은 밝기·굵기로 흘러서, 무엇이 내 이야기이고 무엇이
   *  배경인지 구분이 없었다 — 여덟 항목이 같은 무게로 지나가면 아무것도 안 읽힌다. */
  kind?: "region" | "macro";
}

/** 마퀴를 쓰기 위한 최소 항목 수 — 그 미만은 짧은 내용이 뱅글뱅글 돌아 어색하다(#409) */
const MARQUEE_MIN_ITEMS = 4;
/** 손을 떼거나 포커스가 나간 뒤 다시 흐르기까지의 유예 */
const RESUME_GRACE_MS = 3000;

function ItemBody({ it }: { it: TickerItem }) {
  const macro = it.kind === "macro";
  return (
    <>
      {/* [975] 예전엔 white/45 · white/70 이었다. white/45 는 네이비 위 4.21:1 로
          AA 미달(axe 실측) — 그리고 952 규칙상 어두운 면 위 글자는 흰색이 아니라
          한지 계열이다. 위계는 그대로(배경 지표가 더 옅다), 대비는 7.7 / 12.0. */}
      <span className={macro ? "text-on-dark-muted" : "text-on-dark"}>{it.label}</span>
      <span
        className={`tabular-nums ${
          it.tone === "up"
            ? "text-[#8fb3ff]"
            : it.tone === "down"
              ? "text-[#ff9d9d]"
              : macro
                ? "text-white/60"
                : "text-white/95"
        }`}
      >
        {it.value}
      </span>
    </>
  );
}

function Item({ it, linkable = true }: { it: TickerItem; linkable?: boolean }) {
  const cls = `flex shrink-0 items-baseline gap-1.5 t-sub ${it.kind === "macro" ? "font-semibold" : "font-bold"}`;
  /* 마퀴 복제 트랙(aria-hidden)의 링크는 포커스 함정이 된다 — 복제분은 스팬으로 */
  if (it.href && linkable) {
    return (
      <Link prefetch={false} href={it.href} className={`${cls} no-underline`}>
        <ItemBody it={it} />
      </Link>
    );
  }
  return (
    <span className={cls}>
      <ItemBody it={it} />
    </span>
  );
}

/** 정지 레일 — 가로 스크롤, 항목 전부 링크. 항목이 적을 때와 정지 상태가 같이 쓴다. */
function StaticRail({ items, trailingPad }: { items: TickerItem[]; trailingPad: boolean }) {
  return (
    <div className="ticker-surface flex items-center overflow-x-auto rounded-xl px-0 py-2">
      <span className="ticker-now" aria-hidden="true">
        <span className="njn-dot njn-dot--breathe" style={{ width: 7, height: 7 }} />
        지금
      </span>
      <div
        className={`flex flex-1 items-center justify-center gap-7 ${trailingPad ? "pr-20" : "pr-4"}`}
      >
        {items.map((it, i) => (
          <Item key={i} it={it} />
        ))}
      </div>
    </div>
  );
}

export function HomeTicker({ items, shell }: { items: TickerItem[]; shell?: Shell }) {
  const active = useShellActive(shell);
  /* 사용자가 고른 정지 상태(토글) — 서버·첫 렌더는 재생(마퀴). */
  const [stopped, setStopped] = useState(false);
  /* 감속 모션 — CSS 가 이미 애니메이션을 끄므로 토글은 의미가 없다 */
  const [reducedMotion, setReducedMotion] = useState(false);
  /* 손·포커스가 닿아 있는 동안의 일시 정지(토글과 별개) */
  const [held, setHeld] = useState(false);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const graceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active || typeof window.matchMedia !== "function") return;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) setReducedMotion(true);
    /* 폰·태블릿은 기본이 정지 레일 — 흐르는 숫자를 손가락으로 붙잡을 수 없다 */
    if (coarse || reduce) setStopped(true);
  }, [active]);

  const hold = useCallback(() => {
    if (graceRef.current !== null) {
      window.clearTimeout(graceRef.current);
      graceRef.current = null;
    }
    setHeld(true);
  }, []);
  const release = useCallback(() => {
    if (graceRef.current !== null) window.clearTimeout(graceRef.current);
    graceRef.current = window.setTimeout(() => {
      graceRef.current = null;
      setHeld(false);
    }, RESUME_GRACE_MS);
  }, []);

  const marquee = items.length >= MARQUEE_MIN_ITEMS && !stopped;

  useEffect(() => {
    const el = bandRef.current;
    if (!el || !active || !marquee) return;
    /* touchstart 는 passive 로 — 가로 스크롤을 막지 않는다 */
    el.addEventListener("touchstart", hold, { passive: true });
    el.addEventListener("touchend", release, { passive: true });
    el.addEventListener("touchcancel", release, { passive: true });
    return () => {
      el.removeEventListener("touchstart", hold);
      el.removeEventListener("touchend", release);
      el.removeEventListener("touchcancel", release);
      if (graceRef.current !== null) window.clearTimeout(graceRef.current);
    };
  }, [active, marquee, hold, release]);

  if (items.length === 0) return null;

  /* 토글은 마퀴가 가능한 경우에만(항목 4개 이상 · 감속 모션 아님) */
  const showToggle = items.length >= MARQUEE_MIN_ITEMS && !reducedMotion;

  /* 띠 오른쪽 끝에 얹는다 — 왼쪽 그림자가 흐르는 숫자를 밑으로 받아 글자가 겹치지 않는다.
     `.tap` 은 position:relative 를 쓰므로(globals.css) 절대배치는 바깥 상자가 맡는다. */
  const toggle = showToggle ? (
    <div className="absolute right-1.5 top-1/2 z-[3] -translate-y-1/2">
      <button
        type="button"
        aria-pressed={stopped}
        onClick={() => setStopped((v) => !v)}
        className="tap rounded-full bg-brand-navy px-2 py-0.5 t-caption font-extrabold text-white/80 [box-shadow:-10px_0_12px_var(--brand-navy)] hover:text-white"
      >
        {stopped ? "재생" : "일시정지"}
      </button>
    </div>
  ) : null;

  if (!marquee) {
    /* 항목이 적거나(빌드 직후 ISR 재생성 전 등) 정지 상태 — 가로 스크롤 레일 */
    return (
      <div className="relative">
        <StaticRail items={items} trailingPad={showToggle} />
        {toggle}
      </div>
    );
  }

  const row = (dup: boolean) => (
    <div
      aria-hidden={dup || undefined}
      className="flex shrink-0 items-center gap-7 pr-7"
    >
      {items.map((it, i) => (
        <Item key={`${dup ? "d" : "o"}-${i}`} it={it} linkable={!dup} />
      ))}
    </div>
  );

  return (
    <div className="relative">
      <div
        ref={bandRef}
        className={`ticker-band ticker-surface relative flex items-center overflow-hidden rounded-xl px-0 py-2${held ? " ticker-paused" : ""}`}
        onPointerDown={hold}
        onPointerUp={release}
        onPointerCancel={release}
        onFocusCapture={hold}
        onBlurCapture={release}
      >
        {/* [962] 앞머리 "지금" 칩 — 숨쉬는 온점이 "이 숫자는 지금 값"이라고 말한다 */}
        <span className="ticker-now" aria-hidden="true">
          <span className="njn-dot njn-dot--breathe" style={{ width: 7, height: 7 }} />
          지금
        </span>
        {/* 인라인 play-state 는 `.ticker-paused` CSS(요청)가 붙기 전에도 멈춤이 동작하게 하는 보증 */}
        <div
          className="ticker-track flex w-max"
          style={held ? { animationPlayState: "paused" } : undefined}
        >
          {row(false)}
          {row(true)}
        </div>
      </div>
      {toggle}
    </div>
  );
}
