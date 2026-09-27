"use client";

import { useEffect, useRef, useState } from "react";
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

/* 홈 리디자인(#408) 시안 B — 홈 첫 요소인 검색([1012] 왼쪽 정렬·평면).
 *
 * HeaderSearch 와 같은 원천(/api/search/unified · settle 대기 규칙 · 최근
 * 검색 저장소)을 쓰되, 히어로 크기의 독립 컴포넌트다. 아래 한 줄은 전부 실데이터:
 * 최근 검색(localStorage) · 최근 본 단지(localStorage) + 지도에서 찾기
 * (지어낸 "인기 단지"는 그리지 않는다). [v4] 칩 → 글자 링크 한 줄.
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

/* [v4 · 규칙 6·8] 검색 아래 "지역 바로 보기" 칩 4개(강남·마포·송파·남양주 → /map?region=)는 뺐다 — 바로 아래
   "지역 동향" 목록의 행이 같은 지역·같은 주소로 간다(같은 사실 두 번). 칩은 누르면 상태가 바뀌는 필터에만 쓴다. */

/** 회전 플레이스홀더 — 검색이 무엇을 찾아 주는지 예고한다(단지·지역·노트·뉴스).
 *  실제 존재하는 단지·지역만 적는다(헬리오시티: 서울 송파구 실거래 다수). */
const PLACEHOLDERS = [
  "단지명 — 예: 헬리오시티",
  "지역명 — 예: 마포구 신축",
  "동네 + 임장노트 — 예: 잠실 임장노트",
  "뉴스·재건축 — 예: 목동 재건축",
];

const searchHref = (k: string) => `/search?q=${encodeURIComponent(k)}`;

/* [1012 · 채점 A · 규칙 1·2] 검색창이 홈의 첫 요소다 — 중앙 정렬 슬로건·부제 문단을 걷고 왼쪽 정렬(숨고식
   입력 유도 질문 한 줄은 page.tsx 가 그린다). 상자는 1px 선 + 8px + 그림자 없음(기준 4곳 공통) — 예전
   `border-2 border-primary` + 파란 그림자 32/44px 는 첫 화면의 가장 큰 "AI 티"였다. 포커스일 때만 선이
   파랗게 바뀐다(field-focus 와 같은 언어). 칩도 그림자·들림(hover:-translate-y) 없이 1px 선.
   [963] 의 커버리지 한 줄(coverage prop)은 검색 아래 실데이터 입구 목록(HomeEntryList)으로 옮겨 뺐다. */
export function HomeHeroSearch({
  shell,
}: {
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
    /* [1012] 왼쪽 정렬(mx-auto 없음). [v4 · 규칙 12] 홈이 가운데 한 줄(760px)이 되어 검색 상자도 그 폭을 다 쓴다
       (예전 640px 죄기는 1240px 2단 화면의 것) — 아래 한 줄과 오른쪽 끝이 맞는다. */
    <div className="w-full">
      {/* 검색 상자 + 자동완성 패널 — 바깥 클릭 감지(boxRef)와 절대배치 기준이 여기다 */}
      <div ref={boxRef} className="relative w-full">
        {/* [968 · 9] <form> 으로 감싼다 — 모바일 키보드의 "검색" 키(enterKeyHint)가
            폼 제출로 이어지고, Enter 도 같은 경로(onSubmit)로 수렴한다. */}
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2.5 rounded-lg border border-line-strong bg-surface py-2.5 pl-3.5 pr-1.5 transition-colors focus-within:border-primary md:py-3"
        >
          <Icon name="search" size={19} className="shrink-0 text-text-2" />
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
            className="w-full min-w-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-text-3"
          />
          <button
            type="submit"
            className="btn-primary press shrink-0 rounded-lg px-4 py-2 text-[13px]"
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

      {/* [v4 · 규칙 6·7] 검색 아래 **한 줄** — 칩(1px 선 알약 + 앞 아이콘)을 글자 링크로. 칩은 필터에만 쓴다.
          왼쪽: 최근 검색·최근 본 단지(실기록 — 없으면 줄의 이 부분이 없다) / 오른쪽 끝: 지도에서 찾기(늘 있다).
          넘치면 줄 안에서 가로로 밀린다(줄바꿈으로 두세 줄이 되지 않게). [968 · 9] 전부 Link(프리페치). */}
      <div className="mt-2 flex min-w-0 items-center gap-3 t-sub">
        {hasHistory && (
          /* 가로 스크롤 상자는 세로도 자른다 — 링크의 터치 여백(tap-line 위아래 7px)이 잘리지 않게 같은 만큼 안쪽 여백 */
          <div className="-my-[7px] flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap py-[7px] [scrollbar-width:none]">
            <span className="shrink-0 text-text-3">최근</span>
            {recents.slice(0, 3).map((k) => (
              <Link
                key={`r-${k}`}
                href={searchHref(k)}
                prefetch={chipPrefetch}
                /* 최근 검색 재사용 기록 — 이동을 막지 않고 곁에서 남긴다 */
                onClick={() => pushRecentSearch(k)}
                className="tap-line max-w-[160px] shrink-0 truncate text-text-2 no-underline"
              >
                {k}
              </Link>
            ))}
            {recentComplexes.slice(0, 3).map((c) => (
              <Link
                key={`c-${c.id}`}
                href={complexHrefFromId(c.id)}
                prefetch={chipPrefetch}
                className="tap-line max-w-[180px] shrink-0 truncate font-medium text-text-1 no-underline"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
        {/* 내 동네는 지도에서 — 검색 무결과 화면의 수요 카드는 그대로 살아 있다.
            [968 · 9] /map 은 가장 무거운 화면이라 Link 프리페치의 이득이 제일 크다. */}
        <Link
          href="/map"
          prefetch={chipPrefetch}
          className={`tap-line shrink-0 font-bold text-primary no-underline ${hasHistory ? "ml-auto" : ""}`}
        >
          지도에서 내 동네 찾기 ›
        </Link>
      </div>
    </div>
  );
}
