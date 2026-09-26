"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { pushRecentSearch, readRecentSearches } from "@/lib/search/recent-searches";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { useShellActive } from "@/lib/client/viewport-shell";
import { complexItem, flattenUnified, type FlatItem, type UnifiedJson } from "@/app/search/unified-suggest";
import { QUERY_TOO_LONG, SEARCH_QUERY_MAX, badRequestNotice } from "@/lib/search/complex-preview";

/* P2-14: 데스크탑 GNB 검색 — input + 통합 자동완성.
   /api/search/unified?q= (대기 규칙은 lib/search/settle) · 단지·매물·노트·뉴스 그룹 제안.
   항목 클릭 → 각 상세 · Enter → /search?q=… · Esc 닫기. 스타일은 기존 글래스 인풋 유지.
   [966] 콤보박스 패턴(/search 와 동일) — ↑↓ 순환·Enter 로 활성 항목 열기·Esc 는 목록만
   닫고 포커스는 남긴다(한 번 더 누르면 인풋을 떠난다). 포커스는 늘 인풋에 있고
   활성 항목은 aria-activedescendant 로만 가리킨다 — 계속 타이핑해 좁힐 수 있게.
   [1008 · S] 드롭다운(최근 검색·제안·결과 없음)은 app/search/UnifiedSuggestPanel 로 옮겨 next/dynamic 으로
   싣는다 — 이 파일은 전 페이지 첫 묶음에 실리고 /complex/[id] 는 479/480KB 다. 입력창 포커스 때 미리 받는다.
   단지 줄은 검색어 강조·읍면동·세대수·6개월 거래, 0건이면 띄어 쓰는 요령·지도에서 찾기·비슷한 이름. */

const LISTBOX_ID = "hs-listbox";
const optionId = (i: number) => `hs-opt-${i}`;
const loadPanel = () => import("@/app/search/UnifiedSuggestPanel");
const Panel = dynamic(loadPanel, { ssr: false });

export function HeaderSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<FlatItem[]>([]);
  /* [1008 · S] 전 그룹 0건일 때 오는 "비슷한 이름" 단지 · 결과를 받아 온 검색어(강조·없음 문구) */
  const [similar, setSimilar] = useState<FlatItem[]>([]);
  const [searched, setSearched] = useState("");
  /** 조회에 실패한 그룹 — 비어 있지 않으면 "결과 없음" 문구를 쓰지 않는다. */
  const [failed, setFailed] = useState(false);
  /** [1008 · 리뷰 B] 장애도 결과 없음도 아닌 안내(검색어 80자 초과) */
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /* 항목 12 — 빈 입력 포커스 시 보여줄 최근 검색어 (/search 와 같은 저장소) */
  const [recents, setRecents] = useState<string[]>([]);
  /* [966] 키보드로 가리키는 항목 — -1 은 없음(Enter 가 통합 검색으로 간다) */
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);
  /* [968 · 41] 이 인풋은 lg 미만에서 display:none(hidden lg:block)인데 전역 keydown·
     mousedown 리스너는 모든 뷰포트에서 등록됐다. 데스크톱 뷰포트(md+, 키보드가 있는
     쪽)에서만 리스너를 단다 — 서버 HTML(인풋 마크업)은 그대로. 판정·래치 규칙은
     lib/client/viewport-shell(홈 두 벌 섬과 동일). */
  const desktop = useShellActive("desktop");

  const hasQuery = q.trim().length > 0;
  const showRecents = open && !hasQuery && recents.length > 0;
  const showResults = open && hasQuery && !!searched;
  /* 한 번에 한 목록만 보이므로 옵션도 하나 — 최근 검색어 · 제안 · (0건이면) 비슷한 이름 */
  const options: FlatItem[] = notice ? [] : items.length ? items : similar;
  const optionCount = showRecents ? recents.length : showResults ? options.length : 0;

  /* 목록이 바뀌면 가리키던 자리는 의미를 잃는다 */
  useEffect(() => setActive(-1), [items, similar, recents, open, hasQuery]);

  /* 항목 12 — `/` 단축키로 검색 진입. 입력 중(폼 요소·contentEditable)에는
     끼어들지 않는다. 헤더 인풋이 화면에 없는 뷰포트(lg 미만)에서는 /search 로. */
  useEffect(() => {
    if (!desktop) return;
    function onKey(e: KeyboardEvent) {
      /* [OPT-45] ⌘K/Ctrl+K 도 검색 진입 — 다른 도구들에서 몸에 밴 단축키를 존중 */
      const isCmdK = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (!isSlash && !isCmdK) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      )
        return;
      e.preventDefault();
      const el = inputRef.current;
      // offsetParent === null ⇒ display:none (hidden lg:block 의 lg 미만)
      if (el && el.offsetParent !== null) el.focus();
      else router.push("/search");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, desktop]);

  /* 통합 서제스트 — 대기 시간은 lib/search/settle 에 모아 뒀다(값이 화면마다
     달랐던 이유가 어디에도 없었다). 한글 조합 중에는 더 길게 기다린다:
     예전 200ms 로는 380ms 간격으로 치는 사람에게 "ㄹ","라","래","램"… 이
     그대로 요청으로 나갔다(실측). */
  useEffect(() => {
    const query = settledQuery;
    if (!query) {
      setItems([]);
      setSimilar([]);
      setSearched("");
      setFailed(false);
      setNotice(null);
      setOpen(false);
      return;
    }
    abortRef.current?.abort();
    /* [1008 · 리뷰 B] 80자 넘는 입력은 보내지 않는다 — 서버가 400 을 내고, 예전 화면은 그걸 장애로 적었다 */
    const showNotice = (n: string) => {
      setItems([]);
      setSimilar([]);
      setFailed(false);
      setNotice(n);
      setSearched(query);
      setOpen(true);
    };
    if (query.trim().length > SEARCH_QUERY_MAX) {
      showNotice(QUERY_TOO_LONG);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    void (async () => {
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          const n = await badRequestNotice(res);
          if (n && !ac.signal.aborted) return showNotice(n);
          throw new Error("unified failed");
        }
        const json = (await res.json()) as UnifiedJson;
        setItems(flattenUnified(json));
        setSimilar((json.suggestions ?? []).map(complexItem));
        /* 조회가 실패한 그룹이 있으면 "일치하는 결과가 없어요"를 쓰지 않는다. */
        setFailed(Array.isArray(json.failed) && json.failed.length > 0);
        setNotice(null);
        setSearched(query);
        setOpen(true);
      } catch {
        if (!ac.signal.aborted) {
          setItems([]);
          setSimilar([]);
          setFailed(true);
          setNotice(null);
          setSearched(query);
          setOpen(true);
        }
      }
    })();
    /* 검색어가 바뀌면 이전 요청을 취소한다 — 늦게 도착한 옛 응답이 새 검색어의
       결과를 덮어쓰면, 화면은 사용자가 치지 않은 말에 답하게 된다. */
    return () => ac.abort();
  }, [settledQuery]);

  /* 바깥 클릭 시 드롭다운 닫기 — [968 · 41] 인풋이 보이는 뷰포트에서만 */
  useEffect(() => {
    if (!desktop) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [desktop]);

  function submit() {
    const query = q.trim();
    if (!query) {
      router.push("/search");
      return;
    }
    pushRecentSearch(query);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  }

  /** 최근 검색어 클릭 → 통합 검색 결과로 (맨 앞 재승격 저장 포함) */
  function pickRecent(k: string) {
    pushRecentSearch(k);
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(k)}`);
  }

  /** 제안 클릭(링크가 이동한다) — 패널을 닫고 입력을 비운다 */
  function picked() {
    setOpen(false);
    setQ("");
  }

  /** 포커스·↓ 로 목록을 연다 — 검색어가 있으면 제안, 비어 있으면 최근 검색어 */
  function openForCurrent() {
    void loadPanel();
    if (hasQuery) {
      if (searched) setOpen(true);
      return;
    }
    // 항목 12 — 빈 입력이면 최근 검색어를 보여준다 (없으면 열지 않음)
    const r = readRecentSearches();
    setRecents(r);
    if (r.length > 0) setOpen(true);
  }

  /** 활성 항목을 연다 — 없으면 false (호출부가 통합 검색으로 넘긴다) */
  function pickActive(): boolean {
    if (active < 0) return false;
    if (showRecents) {
      const k = recents[active];
      if (k === undefined) return false;
      pickRecent(k);
      return true;
    }
    const it = options[active];
    if (!it) return false;
    picked();
    router.push(it.href);
    return true;
  }

  function onInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    /* 한글 조합 중 방향키·Enter 는 IME 몫 — 가로채지 않는다 */
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (optionCount === 0) {
          openForCurrent();
          return;
        }
        setActive((i) => (i + 1) % optionCount);
        return;
      case "ArrowUp":
        e.preventDefault();
        if (optionCount === 0) return;
        setActive((i) => (i <= 0 ? optionCount - 1 : i - 1));
        return;
      case "Home":
        if (optionCount === 0 || active < 0) return;
        e.preventDefault();
        setActive(0);
        return;
      case "End":
        if (optionCount === 0 || active < 0) return;
        e.preventDefault();
        setActive(optionCount - 1);
        return;
      case "Enter":
        e.preventDefault();
        if (!pickActive()) submit();
        return;
      case "Escape":
        /* 열려 있으면 목록만 닫는다(포커스 유지) · 이미 닫혀 있으면 인풋을 떠난다 */
        if (open) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
          return;
        }
        e.currentTarget.blur();
        return;
      default:
        return;
    }
  }

  return (
    <div ref={boxRef} className="relative hidden lg:block">
      {/* 폭 실측(2026-08-16 캡처): w-[200px]에서 입력부 가용폭이 ~125px 인데
          플레이스홀더가 ~150px 라 "검색"이 글자 중간에서 잘렸다. 문구가 온전히
          들어가는 폭으로 넓히고, 그래도 좁아지는 상황은 말줄임(…)으로 접는다. */}
      <div className="field-focus flex w-[232px] items-center gap-2 rounded-xl bg-[var(--glass-bg)] px-3.5 py-2 text-[13px] text-text-3 xl:w-[252px]">
        <span aria-hidden>⌕</span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          {...compositionProps}
          onFocus={openForCurrent}
          onKeyDown={onInputKeyDown}
          role="combobox"
          aria-expanded={showRecents || showResults}
          aria-controls={LISTBOX_ID}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-autocomplete="list"
          placeholder="단지·매물·노트·뉴스 검색"
          aria-label="통합 검색 (단축키 /)"
          autoComplete="off"
          className="w-full text-ellipsis bg-transparent text-[13px] text-ink outline-none placeholder:text-text-3"
        />
        {/* 항목 12 — 단축키 발견성. 장식이므로 스크린리더에서는 숨긴다(aria-label 에 명시). */}
        <kbd
          aria-hidden
          className="shrink-0 rounded-md border border-line bg-[var(--glass-bg)] chip-pad-tight font-sans t-caption font-bold text-text-3"
        >
          /
        </kbd>
      </div>

      {/* [970 · A-02] 드롭다운 배경은 .popover-surface(surface 토큰 92%, 양 테마) — 패널 파일 참고 */}
      {(showRecents || showResults) && (
        <Panel
          variant="header"
          listId={LISTBOX_ID}
          optionId={optionId}
          query={searched}
          recents={showRecents ? recents : undefined}
          items={items}
          similar={similar}
          active={active}
          failed={failed}
          notice={notice}
          onHover={setActive}
          onPick={picked}
          onPickRecent={pickRecent}
          onSubmit={submit}
          submitLabel={`“${q.trim()}” 통합 검색 ›`}
        />
      )}
    </div>
  );
}
