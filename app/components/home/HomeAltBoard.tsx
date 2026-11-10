"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { readAuthedHint } from "@/lib/auth/authed-hint";
import { RecentComplexChips } from "@/app/components/RecentComplexes";
import Link from "@/app/components/IntentLink";

/* [1137 · 홈 개편 — 시세판(B) ↔ 내 화면(C) 번갈아] 소유자 2026-11-10 시안 선택: "b-c 를 섞어서 번갈아 가면서 보여지는 방식".
   같은 자리에 두 판을 겹쳐 두고 번갈아 보인다 — 시세판(대표 지역 숫자 · 시세 흐름 · 서버 HTML 그대로) ↔ 내 화면(관심 지역 · 관심단지 브리핑 · 오늘 활동 · 최근 본 단지).
   · 비회원은 시세판만(탭도 없다 — 서버 HTML 과 같은 모양 · 크롤 경로 그대로).
   · 로그인 힌트가 있으면 탭 둘 + 9초마다 자동 넘김. 손을 대면(가리킴 · 초점 · 탭 누름) 멈춘다. "움직임 줄이기" 설정이면 자동 넘김 없음.
   · 두 판은 한 칸(grid 1/1)에 겹쳐 있어 칸 높이 = 더 큰 판 — 넘어갈 때 아래 화면이 밀리지 않는다. 안 보이는 판은 inert(초점 · 읽기 프로그램에서 빠진다).
   내 화면의 조각은 로그인 확인 뒤에만 받는다(비회원 첫 화면 번들에 없다). */
const HomeMyRegions = dynamic(() => import("@/app/components/home/HomeMyRegions").then((m) => m.HomeMyRegions), { ssr: false });
const HomeWatchlistBrief = dynamic(() => import("@/app/components/HomeWatchlistBrief").then((m) => m.HomeWatchlistBrief), { ssr: false });
const HomeEngagementCard = dynamic(() => import("@/app/components/home/HomeEngagementCard").then((m) => m.HomeEngagementCard), { ssr: false });

type Tab = "market" | "mine";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "market", label: "시세판" },
  { key: "mine", label: "내 화면" },
];
const INTERVAL_MS = 9000;
const MY_LINKS: Array<{ href: string; title: string; sub: string }> = [
  { href: "/notes?tab=mine", title: "내 임장노트", sub: "쓴 노트 · 비공개 포함" },
  { href: "/my/watchlist", title: "관심 단지", sub: "새 실거래 알림" },
  { href: "/welcome?next=/", title: "관심 지역", sub: "1~3곳 고르기" },
  { href: "/my/analyses", title: "내 분석", sub: "AI 분석 기록" },
];

export function HomeAltBoard({ market }: { market: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>("market");
  const [paused, setPaused] = useState(false);
  const touched = useRef(false);

  /* 시세판이 비었나(자료 수집 전 · 대표 지역 없음) — 서버 조각이 아무것도 안 그렸으면 높이가 없다. 비었으면 내 화면만 보인다(빈 판으로 넘기지 않는다) */
  const marketRef = useRef<HTMLDivElement>(null);
  const [marketEmpty, setMarketEmpty] = useState(false);

  useEffect(() => {
    setAuthed(readAuthedHint());
  }, []);

  useEffect(() => {
    if (!authed) return;
    /* 두 판이 한 칸에 겹쳐 있어 판 자체 높이는 큰 쪽을 따른다 — 안쪽 내용 높이를 잰다. 서버 조각이 늦게 흘러올 수 있어 한 번 더 잰다 */
    const measure = () => {
      const el = marketRef.current;
      if (!el) return;
      let h = 0;
      for (const c of Array.from(el.children)) h += (c as HTMLElement).offsetHeight;
      const empty = h < 8;
      setMarketEmpty(empty);
      if (empty) setTab("mine");
    };
    measure();
    const t = window.setTimeout(measure, 1800);
    return () => window.clearTimeout(t);
  }, [authed]);

  useEffect(() => {
    if (!authed || paused || touched.current || marketEmpty) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setTab((cur) => (cur === "market" ? "mine" : "market")), INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [authed, paused, marketEmpty]);

  if (!authed) return <>{market}</>;

  const pick = (k: Tab) => {
    touched.current = true;
    setPaused(true);
    setTab(k);
  };

  return (
    <div className="flex flex-col gap-2" onPointerEnter={() => setPaused(true)} onPointerLeave={() => !touched.current && setPaused(false)} onFocusCapture={() => setPaused(true)}>
      <div role="tablist" aria-label="홈 판 고르기" className={`items-center gap-1.5 ${marketEmpty ? "hidden" : "flex"}`}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`home-alt-tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`home-alt-pane-${t.key}`}
            onClick={() => pick(t.key)}
            className={`chip inline-flex min-h-10 items-center px-3.5 t-sub font-bold md:min-h-9 ${tab === t.key ? "chip-active" : "border border-line bg-surface text-text-2"}`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto t-caption text-text-3" aria-live="off">
          {paused || touched.current ? "멈춤" : "9초마다 넘김"}
        </span>
      </div>
      <div className="grid">
        <div
          id="home-alt-pane-market"
          ref={marketRef}
          role="tabpanel"
          aria-labelledby="home-alt-tab-market"
          inert={tab !== "market"}
          className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-3 transition-opacity duration-300 lg:gap-4 ${tab === "market" ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {market}
        </div>
        <div
          id="home-alt-pane-mine"
          role="tabpanel"
          aria-labelledby="home-alt-tab-mine"
          inert={tab !== "mine"}
          className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-3 transition-opacity duration-300 ${tab === "mine" ? "opacity-100" : "pointer-events-none opacity-0"}`}
        >
          {/* 늘 보이는 바로 가기 — 관심 지역 · 관심 단지 · 노트가 아직 없는 사람에게도 이 판이 비지 않는다 */}
          <nav aria-label="내 화면 바로 가기" className="card grid grid-cols-2 gap-2 rounded-2xl p-[var(--pad-card)] md:grid-cols-4">
            {MY_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="press flex min-h-14 flex-col justify-center rounded-xl border border-line bg-surface px-3 py-2 no-underline hover:border-line-strong">
                <span className="t-body font-bold text-ink">{l.title}</span>
                <span className="t-caption text-text-3">{l.sub}</span>
              </Link>
            ))}
          </nav>
          <HomeMyRegions />
          <HomeWatchlistBrief />
          <HomeEngagementCard />
          <RecentComplexChips className="rounded-2xl border border-line bg-surface p-4" />
        </div>
      </div>
    </div>
  );
}

export default HomeAltBoard;
