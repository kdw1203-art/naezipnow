"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { pushRecentSearch, readRecentSearches } from "@/lib/search/recent-searches";
import { useRecentComplexes } from "@/app/components/RecentComplexes";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { useShellActive, type Shell } from "@/lib/client/viewport-shell";
import { useReducedData } from "@/lib/client/network-hints";
import { complexItem, flattenUnified, type FlatItem, type UnifiedJson } from "@/app/search/unified-suggest";
import { QUERY_TOO_LONG, SEARCH_QUERY_MAX, badRequestNotice } from "@/lib/search/complex-preview";

/* 홈 리디자인(#408) 시안 B — 화면 정중앙 대형 검색.
 *
 * HeaderSearch 와 같은 원천(/api/search/unified · settle 대기 규칙 · 최근
 * 검색 저장소)을 쓰되, 히어로 크기의 독립 컴포넌트다. 칩은 전부 실데이터:
 * 최근 검색(localStorage) · 최근 본 단지(localStorage) — 없으면 실데이터
 * 커버 지역 바로가기로 대체한다(지어낸 "인기 단지"는 그리지 않는다).
 *
 * [968 · 9] 칩·제안은 `<Link>` 다. 예전엔 전부 `<button onClick={router.push}>`
 * 였다 — 프리페치가 없고, 탭 핸들러 안에서 라우터 전환(가장 무거운 /map 포함)이
 * 돌아 INP 에 그대로 잡혔다. 링크는 뷰포트에서 미리 받아 두고, 누르는 순간엔
 * 브라우저 기본 내비게이션이라 핸들러가 가볍다. 분석·기록 호출은 onClick 에서
 * 하되 이동을 막지 않는다.
 * [968 · 19] 데이터 절약·3g 이하(useReducedData)면 칩 프리페치를 끈다 —
 * 호버/탭 시점에만 받는다.
 */

/* [1008 · S] 응답 → 목록 한 줄 변환은 헤더 검색과 같은 모듈(app/search/unified-suggest).
   드롭다운은 app/search/UnifiedSuggestPanel(next/dynamic — 친 뒤에만 필요, 홈 첫 묶음 462/495KB 를 늘리지
   않게). 입력창 포커스 때 미리 받는다. 키보드 ↑↓ Enter Esc(콤보박스) · 단지 줄 검색어 강조·읍면동·세대수·
   6개월 거래 · 0건이면 띄어 쓰는 요령·지도에서 찾기·비슷한 이름 + 전체 검색·수요 남기기. */
const loadPanel = () => import("@/app/search/UnifiedSuggestPanel");
const Panel = dynamic(loadPanel, { ssr: false });
const LIST_ID = "hero-suggest";
const optionId = (i: number) => `hero-opt-${i}`;
/** 홈 패널에 그리는 줄 수 — 키보드 순환도 이 수만큼(리뷰 B: ↓가 그리지 않은 8번째 줄로 가 Enter 로 안 보이던 곳에 갔다) */
const HERO_MAX = 7;

/** [950] 지역 칩은 서버(홈)가 실데이터 지역 카드에서 넘긴다 — 티커·카드와 같은 지역.
 *  예전 고정 폴백(동안구·만안구·의왕시·과천시)은 초기 커버리지의 흔적이라 서비스가
 *  안양 근방만 다루는 것처럼 읽혔다(홈 비판 ③). 넘어온 칩이 없으면 칩 행을 그리지 않는다. */
export interface HeroRegionChip {
  label: string;
  href: string;
}

/** 회전 플레이스홀더 — 검색이 무엇을 찾아 주는지 예고한다(단지·지역·노트·뉴스).
 *  실제 존재하는 단지·지역만 적는다(헬리오시티: 서울 송파구 실거래 다수). */
const PLACEHOLDERS = [
  "단지명 — 예: 헬리오시티",
  "지역명 — 예: 마포구 신축",
  "동네 + 임장노트 — 예: 잠실 임장노트",
  "뉴스·재건축 — 예: 목동 재건축",
];

const searchHref = (k: string) => `/search?q=${encodeURIComponent(k)}`;

export function HomeHeroSearch({
  regionChips = [],
  coverage,
  shell,
}: {
  regionChips?: HeroRegionChip[];
  /** [963] 커버리지 한 줄(서버 컴포넌트)을 칩 행 **안에** 받는다 — 아래 §칩 행 주석 참조 */
  coverage?: ReactNode;
  /** [968 · 8] 어느 벌인지 — 안 보이는 벌은 타이머·조회·리스너를 시작하지 않는다 */
  shell?: Shell;
}) {
  const router = useRouter();
  /* [968 · 8] 이 벌이 실제로 보이는 벌인가(마운트 뒤 matchMedia). false 면 아래 효과 전부 건너뛴다. */
  const active = useShellActive(shell);
  /* [968 · 19] 저속망이면 칩 프리페치 끔 — 마운트 뒤 한 번 계산(하이드레이션 안전) */
  const lite = useReducedData();
  const chipPrefetch = lite ? false : undefined;
  const [q, setQ] = useState("");
  const [phIdx, setPhIdx] = useState(0);
  const [focused, setFocused] = useState(false);

  /* 입력이 비어 있고 포커스도 없을 때만 예시 문구를 돌린다.
     [968 · 8] 안 보이는 벌은 돌리지 않는다 — 360px 폰에서 인터벌 2개 → 1개. */
  useEffect(() => {
    if (!active || q || focused) return;
    const t = window.setInterval(() => {
      setPhIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3500);
    return () => window.clearInterval(t);
  }, [active, q, focused]);
  const [items, setItems] = useState<FlatItem[]>([]);
  const [similar, setSimilar] = useState<FlatItem[]>([]);
  /** 결과를 받아 온 검색어 — 강조·결과 없음 문구는 이것으로(아직 굳지 않은 입력이 아니라) */
  const [searched, setSearched] = useState("");
  const [failed, setFailed] = useState(false);
  /** [1008 · 리뷰 B] 장애도 결과 없음도 아닌 안내(검색어 80자 초과) */
  const [notice, setNotice] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  /* [968 · 8] 최근 본 단지(로컬 + 서버 병합)도 보이는 벌만 읽는다 */
  const { items: recentComplexes } = useRecentComplexes(active);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);

  /* 최근 검색은 마운트 후에만 (SSR 불일치 방지) */
  useEffect(() => {
    if (!active) return;
    setRecents(readRecentSearches());
  }, [active]);

  /* 제안 조회 — HeaderSearch 와 같은 unified 엔드포인트 */
  useEffect(() => {
    const query = settledQuery.trim();
    if (query.length < 2) {
      setItems([]);
      setSimilar([]);
      setSearched("");
      setNotice(null);
      return;
    }
    abortRef.current?.abort();
    /* [1008 · 리뷰 B] 80자 넘는 입력은 보내지 않는다 — 서버 400 을 예전엔 장애로 적었다 */
    if (query.length > SEARCH_QUERY_MAX) {
      setItems([]);
      setSimilar([]);
      setFailed(false);
      setNotice(QUERY_TOO_LONG);
      setSearched(query);
      setOpen(true);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, { signal: ac.signal })
      .then(async (res) => {
        if (res.ok) return { r: (await res.json()) as UnifiedJson, n: null };
        return { r: null, n: await badRequestNotice(res) };
      })
      .then(({ r, n }) => {
        if (ac.signal.aborted) return;
        setItems(r ? flattenUnified(r) : []);
        setSimilar((r?.suggestions ?? []).map(complexItem));
        setFailed(!n && (!r || (r.failed?.length ?? 0) > 0));
        setNotice(n);
        setSearched(query);
        setOpen(true);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [settledQuery]);

  /* 목록이 바뀌면 가리키던 자리는 의미를 잃는다 */
  useEffect(() => setActiveIdx(-1), [items, similar, open]);
  /* 그리는 줄 = 키보드가 도는 줄(한 목록을 두 곳이 쓴다) */
  const shown = items.slice(0, HERO_MAX);
  const options = notice ? [] : shown.length ? shown : similar;

  /* 바깥 클릭 → 닫기. [968 · 8] 문서 리스너도 보이는 벌 하나만 단다. */
  useEffect(() => {
    if (!active) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [active]);

  function submit() {
    const k = q.trim();
    if (!k) return;
    pushRecentSearch(k);
    setOpen(false);
    router.push(searchHref(k));
  }

  /* [968 · 9] 제안 링크를 누르면 패널을 닫고 입력을 비운다 — 이동은 Link 가 한다 */
  function onPickSuggestion() {
    setOpen(false);
    setQ("");
  }

  /* [1008 · S] 콤보박스 키보드 — ↑↓ 순환 · Enter 는 활성 항목(없으면 폼 제출 = 전체 검색) · Esc 목록만 닫기.
     한글 조합 중 방향키·Enter 는 IME 몫이라 가로채지 않는다. */
  const showPanel = open && q.trim().length >= 2 && !!searched;
  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    const n = showPanel ? options.length : 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!showPanel) {
        if (searched) setOpen(true);
        return;
      }
      if (n) setActiveIdx((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0 && options[activeIdx]) {
      e.preventDefault();
      const it = options[activeIdx];
      onPickSuggestion();
      router.push(it.href);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else e.currentTarget.blur();
    }
  }

  const hasHistory = recents.length > 0 || recentComplexes.length > 0;

  return (
    /* [963] 검색 상자만 560px 로 죄고, 칩·커버리지 행은 바깥 폭을 그대로 쓴다.
       예전에는 칩 행이 상자 안(560px)에 갇혀 있어서 "칩 + 커버리지 한 줄"이 항상
       두 줄로 접혔다 — 데스크톱은 1,200px 을 쓸 수 있는데도. */
    <div className="w-full">
      {/* 검색 상자 + 자동완성 패널 — 바깥 클릭 감지(boxRef)와 절대배치 기준이 여기다 */}
      <div ref={boxRef} className="relative mx-auto w-full max-w-[560px]">
        {/* [968 · 9] <form> 으로 감싼다 — 모바일 키보드의 "검색" 키(enterKeyHint)가
            폼 제출로 이어지고, Enter 도 같은 경로(onSubmit)로 수렴한다. */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2.5 rounded-2xl border-2 border-primary bg-surface py-3 pl-4 pr-2 shadow-[0_10px_32px_rgba(29,79,216,.14)] transition-shadow duration-300 focus-within:shadow-[0_14px_44px_rgba(29,79,216,.28)] md:py-3.5"
        >
          <Icon name="search" size={19} className="shrink-0 text-primary" />
          <input
            type="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            {...compositionProps}
            onFocus={() => {
              setFocused(true);
              void loadPanel();
              if (q.trim() && searched) setOpen(true);
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={showPanel}
            aria-controls={LIST_ID}
            aria-activedescendant={showPanel && activeIdx >= 0 ? optionId(activeIdx) : undefined}
            aria-autocomplete="list"
            placeholder={PLACEHOLDERS[phIdx]}
            aria-label="통합 검색"
            autoComplete="off"
            className="w-full min-w-0 bg-transparent text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-text-3"
          />
          <button
            type="submit"
            className="btn-primary press shrink-0 rounded-xl px-4 py-2 text-[13px]"
          >
            검색
          </button>
        </form>

        {/* 제안 드롭다운 — [968 · 9] 항목은 Link (프리페치·가벼운 탭 핸들러).
            0건이면 커버리지 수요 루프(#413)로 잇는 단추("전체 검색·수요 남기기")를 그대로 둔다 — 홈이 제1
            검색 표면이라 여기서 끊기면 수요가 기록되지 않는다. [1008 · S] 그 위에 띄어 쓰는 요령·지도에서
            찾기·비슷한 이름을 먼저 보여 준다(결과 없음 82% 의 대부분이 표기 차이였다). */}
        {showPanel && (
          <Panel
            variant="hero"
            listId={LIST_ID}
            optionId={optionId}
            query={searched}
            items={shown}
            similar={similar}
            active={activeIdx}
            failed={failed}
            notice={notice}
            onHover={setActiveIdx}
            onPick={onPickSuggestion}
            onSubmit={submit}
            submitLabel={
              items.length ? `‘${q.trim()}’ 전체 검색 ›` : `‘${q.trim()}’ 전체 검색·수요 남기기 ›`
            }
            prefetch={chipPrefetch}
          />
        )}
      </div>

      {/* 칩 — 최근 검색·최근 본 단지 (실기록), 없으면 커버 지역 바로가기.
          [963] 커버리지 한 줄을 **같은 행**에 둔다(소유자 지시 2026-09-04 "한 줄로").
          예전엔 칩 행과 커버리지 줄이 위아래 두 줄이었는데, 검색창과 티커 사이에
          가운데 정렬 텍스트 두 덩이가 층을 이뤄 여백만 벌어졌다. 둘 다 "검색을 돕는
          보조 정보"라 한 줄에 놓아도 읽는 순서가 흐트러지지 않는다.
          flex-wrap 이라 칩이 여럿이거나 좁은 화면에서는 알아서 접힌다. */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5">
        {hasHistory ? (
          <>
            {recents.slice(0, 3).map((k) => (
              <Link
                key={`r-${k}`}
                href={searchHref(k)}
                prefetch={chipPrefetch}
                /* 최근 검색 재사용 기록 — 이동을 막지 않고 곁에서 남긴다 */
                onClick={() => pushRecentSearch(k)}
                className="chip max-w-[160px] truncate bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                ⌕ {k}
              </Link>
            ))}
            {recentComplexes.slice(0, 3).map((c) => (
              <Link
                key={`c-${c.id}`}
                href={complexHrefFromId(c.id)}
                prefetch={chipPrefetch}
                className="chip max-w-[180px] truncate bg-primary-soft px-3 py-1.5 t-sub font-bold text-primary no-underline transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                🏢 {c.name}
              </Link>
            ))}
          </>
        ) : (
          regionChips.length > 0 && (
            <>
              {/* [950] "열린 지역 · 수요 순 확장 중" 은 전국 218개 시군구를 다루는 지금과
                  맞지 않는 문구였다. 바로 눌러 볼 수 있는 지역(시세 카드와 같은 곳)만 보인다. */}
              <span className="text-[12px] font-semibold text-text-3">바로 보기</span>
              {regionChips.map((r) => (
                <Link
                  key={r.label}
                  href={r.href}
                  prefetch={chipPrefetch}
                  className="chip bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
                >
                  {r.label}
                </Link>
              ))}
              {/* 내 동네는 지도에서 — 검색 무결과 화면의 수요 카드는 그대로 살아 있다.
                  [968 · 9] /map 은 가장 무거운 화면이라 Link 프리페치의 이득이 제일 크다. */}
              <Link
                href="/map"
                prefetch={chipPrefetch}
                className="chip bg-primary-soft px-3 py-1.5 t-sub font-bold text-primary no-underline transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(16,28,54,.12)]"
              >
                지도에서 내 동네 찾기
              </Link>
            </>
          )
        )}
        {coverage}
      </div>
    </div>
  );
}
