"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import { CoverageRequestCard } from "./CoverageRequestCard";
import {
  RECENT_SEARCH_MAX,
  readRecentSearches,
  writeRecentSearches,
} from "@/lib/search/recent-searches";
import { useSettledSearchQuery } from "@/lib/search/settle";
import { complexHrefFromId } from "@/lib/seo/complex-slug";
import { trackPlatformEvent } from "@/lib/platform-events-client";
import { useScrollRestore } from "@/lib/client/use-scroll-restore";
import { formatKrwManwon } from "@/lib/format/krw";
import { newsHref, storyHref } from "@/lib/town/post-href";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import { FuzzyBadge, Hl, complexMetaLine } from "./complex-hit";
import {
  NO_MATCH_EXAMPLE,
  NO_MATCH_HINT,
  QUERY_TOO_LONG,
  SEARCH_QUERY_MAX,
  badRequestNotice,
  noMatchTitle,
  type ComplexPreview,
} from "@/lib/search/complex-preview";

/* ============================================================
   통합 검색 경험 — 단지·매물·임장노트·이야기·뉴스 통합 결과
   /api/search/unified?q= (대기 규칙은 lib/search/settle) · 그룹별 섹션 + 더 보기
   각 항목 → 상세(/complex·/listings·/notes·/town/story·/town/news)
   최근 검색 5개 localStorage · 빈/로딩 상태 처리

   [1007 · P2] 이야기(이웃 글)와 뉴스(자동수집 기사)를 **다른 재질**로 그린다 —
   1006 규칙(globals.css .story-* / .news-*)의 축약형: 이야기는 작성자 머리글자·동네 배지가
   있는 흰 카드, 뉴스는 출처·시각이 앞에 오는 구분선 행. 예전엔 board_posts 를 한 종류
   ("뉴스")로 그리고 전부 /town/news/ 로 보냈다. 결과 위 필터 줄에 "이야기"·"뉴스"가 따로 선다.
   ============================================================ */

interface UnifiedStory {
  id: string;
  title: string;
  author: string;
  region: string;
  createdAt: string | null;
  commentCount: number | null;
}
interface UnifiedNews {
  id: string;
  title: string;
  source: string;
  publishedAt: string | null;
}

interface UnifiedResults {
  /** [1008 · S] 미리보기 값(읍면동·세대수·6개월 거래·비슷한 이름)은 선택 — 옛 응답엔 없다 */
  complexes: ComplexPreview[];
  listings: { id: string; title: string; price: string }[];
  notes: { id: string; title: string }[];
  stories: UnifiedStory[];
  news: UnifiedNews[];
}

const EMPTY: UnifiedResults = { complexes: [], listings: [], notes: [], stories: [], news: [] };
/** 전 그룹 실패 시 클라이언트가 적는 이름 — API 의 failed 라벨과 같은 말 */
const ALL_GROUP_LABELS = ["단지", "매물", "임장노트", "이야기", "뉴스"];

/** 측정된 인기가 아님 — 전국 주요 권역 추천 검색어 (가짜 KPI 금지) */
const SUGGESTED_REGIONS = ["강남구", "분당", "마포구", "해운대구"] as const;

/* 최근 검색어 읽기/쓰기는 헤더 검색과 공유한다(항목 12) — lib/search/recent-searches */

type SectionKey = keyof UnifiedResults;

/** [937 검색] 결과 제목에서 검색어 일치 구간만 강조 — 왜 이 결과가 나왔는지
 *  한눈에 보이게 한다. 대소문자 무시, 첫 일치 구간만(과한 강조는 소음). */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-extrabold text-primary">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function hrefFor(key: SectionKey, id: string): string {
  const enc = encodeURIComponent(id);
  switch (key) {
    case "complexes":
      return complexHrefFromId(id);
    case "listings":
      return `/listings/${enc}`;
    case "notes":
      return `/notes/${enc}`;
    case "stories":
      return storyHref(id);
    case "news":
      return newsHref(id);
  }
}

interface Row {
  id: string;
  title: string;
  meta?: string;
  /** [1008 · S] 단지 행 — 검색어 강조(괄호·띄어쓰기 건너뜀) · 읍면동·세대수·6개월 거래 · 비슷한 이름 */
  complex?: ComplexPreview;
  /** [1007] 이야기 행 — 작성자·동네·댓글(뉴스 행과 다른 재질로 그린다) */
  story?: UnifiedStory;
  /** [1007] 뉴스 행 — 출처·발행시각 */
  news?: UnifiedNews;
}
interface Group {
  key: SectionKey;
  label: string;
  more: string;
  rows: Row[];
}

export function SearchClient() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UnifiedResults>(EMPTY);
  const [suggestions, setSuggestions] = useState<UnifiedResults["complexes"]>([]);
  /* 못 불러온 그룹 이름. "결과가 없어요"와 "지금 못 불러왔어요"는 다른 문장이라
     따로 들고 있는다 — 예전엔 조회가 실패해도 빈 결과가 되어 검색어를 의심하게
     만들었다. failed 가 비어 있지 않으면 아래 빈 결과 문구를 쓰지 않는다. */
  const [failed, setFailed] = useState<string[]>([]);
  /* [1008 · 리뷰 B] 장애도 결과 없음도 아닌 안내 — 80자 넘는 검색어(서버 400). 예전엔 전 그룹 실패로 적었다. */
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  /* [937 검색] 빈 화면의 "많이 찾는 단지" — 추측이 아니라 실측(최근 6개월
     실거래 + 조회수, popular_complexes RPC). 실패하면 섹션째 조용히 접는다 —
     부가 정보가 검색 화면을 볼모로 잡지 않는다. */
  const [popular, setPopular] = useState<
    Array<{ id: string; name: string; regionName: string; recentTradeCount: number; avgPriceManwon: number | null }>
  >([]);
  const abortRef = useRef<AbortController | null>(null);
  const { query: settledQuery, compositionProps } = useSettledSearchQuery(q);
  /* 아직 굳지 않은 입력은 "아직 안 물어본 상태"다. 이걸 대기로 안 치면 치는
     도중에 "검색 결과가 없어요"가 떴다 사라진다 — 확인한 적 없는 사실을
     화면에 쓰는 셈이다. */
  const busy = loading || (q.trim() !== "" && q.trim() !== settledQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 마운트: 최근 검색 로드 + URL(?q=) 프리필 */
  useEffect(() => {
    setRecent(readRecentSearches());
    try {
      const initial = new URLSearchParams(window.location.search).get("q")?.trim();
      if (initial) {
        setQ(initial);
      } else {
        /* 제안 모바일7 — 빈 검색으로 새로 들어온 경우는 검색 의도가 명확하다:
           바로 입력할 수 있게 포커스(모바일은 키보드가 올라온다). ?q= 가 있는
           복귀·공유 진입은 결과를 읽는 상황이라 포커스하지 않는다. */
        inputRef.current?.focus();
      }
    } catch {
      // URL 파싱 실패 — 무시
    }
  }, []);

  /* [937 검색] 많이 찾는 단지 로드 — 마운트 1회, 전국 기준 상위 6곳 */
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/map/popular?limit=6", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: { items?: typeof popular }) => {
        if (!ac.signal.aborted && Array.isArray(json.items)) setPopular(json.items);
      })
      .catch(() => {
        /* 실패 시 섹션 미노출 — 검색 자체와 무관 */
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 통합 검색 — 대기 규칙은 lib/search/settle 한 군데에서만 정한다.
     한글 조합 중에는 더 길게 기다린다(조합 중간 상태 "ㄹ","래ㅁ" 로는 아무도
     검색하지 않는데, 예전에는 그 상태가 그대로 요청으로 나갔다). */
  useEffect(() => {
    const query = settledQuery;
    if (!query) {
      setResults(EMPTY);
      setSuggestions([]);
      setFailed([]);
      setNotice(null);
      setLoading(false);
      abortRef.current?.abort();
      return;
    }
    abortRef.current?.abort();
    if (query.trim().length > SEARCH_QUERY_MAX) {
      setResults(EMPTY);
      setSuggestions([]);
      setFailed([]);
      setNotice(QUERY_TOO_LONG);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ac = new AbortController();
    abortRef.current = ac;
    void (async () => {
      try {
        const res = await fetch(`/api/search/unified?q=${encodeURIComponent(query)}`, {
          signal: ac.signal,
        });
        if (!res.ok) {
          const n = await badRequestNotice(res);
          if (n) {
            if (ac.signal.aborted) return;
            setResults(EMPTY);
            setSuggestions([]);
            setFailed([]);
            setNotice(n);
            return;
          }
          throw new Error("unified failed");
        }
        setNotice(null);
        const json = (await res.json()) as Partial<UnifiedResults> & {
          suggestions?: UnifiedResults["complexes"];
          failed?: string[];
        };
        setResults({
          complexes: json.complexes ?? [],
          listings: json.listings ?? [],
          notes: json.notes ?? [],
          stories: json.stories ?? [],
          news: json.news ?? [],
        });
        setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
        setFailed(Array.isArray(json.failed) ? json.failed : []);
        /* [937 검색] 무결과 실측 — 커버리지 카드는 버튼을 눌러야 남지만,
           "찾았는데 없었다"는 사실 자체가 확장 우선순위 데이터다.
           [1008 · 리뷰 B] 단지가 '비슷한 이름'(오타 추정)뿐이면 그것도 무결과로 센다 — metadata.fuzzyOnly=true 로
           따로 적는다(예전엔 결과 있음으로 세어 "결과 없음 82%" 개선 수치가 부풀 수 있었다). */
        const others =
          (json.listings?.length ?? 0) +
          (json.notes?.length ?? 0) +
          (json.stories?.length ?? 0) +
          (json.news?.length ?? 0);
        const complexesAll = json.complexes?.length ?? 0;
        const complexesSure = (json.complexes ?? []).filter((c) => !c.fuzzy).length;
        if (complexesSure + others === 0 && (!json.failed || json.failed.length === 0)) {
          trackPlatformEvent({
            eventName: "search_no_result",
            source: "client",
            campaign: "funnel",
            metadata: { query: query.slice(0, 80), fuzzyOnly: complexesAll > 0 },
          });
        }
      } catch {
        if (!ac.signal.aborted) {
          setResults(EMPTY);
          setSuggestions([]);
          setNotice(null);
          /* 503(전 그룹 실패)·네트워크 오류 — 결과가 없는 게 아니라 못 물어본 것이다. */
          setFailed(ALL_GROUP_LABELS);
        }
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    /* 검색어가 바뀌면 직전 요청을 취소한다 — 늦게 온 옛 응답이 새 결과를
       덮으면 화면이 사용자가 치지 않은 말에 답하게 된다. */
    return () => ac.abort();
  }, [settledQuery]);

  const saveRecent = useCallback((keyword: string) => {
    const k = keyword.trim();
    if (!k) return;
    setRecent((prev) => {
      const next = [k, ...prev.filter((v) => v !== k)].slice(0, RECENT_SEARCH_MAX);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const removeRecent = useCallback((keyword: string) => {
    setRecent((prev) => {
      const next = prev.filter((v) => v !== keyword);
      writeRecentSearches(next);
      return next;
    });
  }, []);

  const runSearch = useCallback(
    (keyword: string) => {
      const k = keyword.trim();
      if (!k) return;
      setQ(k);
      saveRecent(k);
      try {
        window.history.replaceState(null, "", `/search?q=${encodeURIComponent(k)}`);
      } catch {
        // history 갱신 실패 — 무시
      }
    },
    [saveRecent],
  );

  const hasQuery = q.trim().length > 0;
  const total =
    results.complexes.length +
    results.listings.length +
    results.notes.length +
    results.stories.length +
    results.news.length;

  /* [966] 결과 → 상세 → 뒤로가기 스크롤 복원. 키는 URL 과 같은 꼴(/search?q=)로 직접
     조립한다 — runSearch 가 replaceState 로 ?q= 를 바꾸므로 마운트 때 한 번 읽는 기본
     키로는 나갈 때와 돌아올 때가 어긋난다. ready = 그 검색어의 응답이 그려진 뒤. */
  useScrollRestore(
    hasQuery ? `/search?q=${encodeURIComponent(q.trim())}` : "/search",
    hasQuery && !busy && (total > 0 || failed.length > 0),
  );

  const groups: Group[] = [
    {
      key: "complexes",
      label: "단지",
      more: "/complex/browse",
      rows: results.complexes.map((c) => ({ id: c.id, title: c.name, complex: c })),
    },
    {
      key: "listings",
      label: "매물",
      more: "/listings",
      rows: results.listings.map((l) => ({ id: l.id, title: l.title, meta: l.price })),
    },
    {
      key: "notes",
      label: "임장노트",
      more: "/notes",
      rows: results.notes.map((n) => ({ id: n.id, title: n.title })),
    },
    {
      key: "stories",
      label: "이야기",
      more: "/town",
      rows: results.stories.map((p) => ({ id: p.id, title: p.title, story: p })),
    },
    {
      key: "news",
      label: "뉴스",
      more: "/town/news",
      rows: results.news.map((n) => ({ id: n.id, title: n.title, meta: n.source, news: n })),
    },
  ];
  /* [1007] 결과 필터 — "전체" 또는 그룹 하나. 결과가 있는 그룹만 탭으로 선다(빈 탭 금지).
     검색어가 바뀌면 전체로 돌아간다 — 다른 검색어의 결과를 이전 필터로 가리지 않는다. */
  const [filter, setFilter] = useState<SectionKey | "all">("all");
  useEffect(() => setFilter("all"), [settledQuery]);
  const presentGroups = groups.filter((g) => g.rows.length > 0);
  const visibleGroups =
    filter === "all" ? presentGroups : presentGroups.filter((g) => g.key === filter);

  /* [941] 키보드 내비게이션 — ↑↓ 로 결과를 훑고 Enter 로 연다(표준 콤보박스
     관행). 포커스는 입력창에 남는다 — 계속 타이핑해 검색을 좁힐 수 있게. */
  const flatRows = useMemo(
    () =>
      visibleGroups.flatMap((g) =>
        g.rows.map((r) => ({ key: `${g.key}:${r.id}`, group: g.key, href: hrefFor(g.key, r.id) })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, filter],
  );
  const [activeIdx, setActiveIdx] = useState(-1);
  useEffect(() => setActiveIdx(-1), [results]);
  useEffect(() => {
    if (activeIdx < 0) return;
    document
      .getElementById(`search-opt-${activeIdx}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);
  const flatIndexOf = useMemo(() => {
    const m = new Map<string, number>();
    flatRows.forEach((r, i) => m.set(r.key, i));
    return m;
  }, [flatRows]);
  const router = useRouter();
  const openActive = useCallback(() => {
    const row = activeIdx >= 0 ? flatRows[activeIdx] : null;
    if (!row) return false;
    saveRecent(q);
    trackPlatformEvent({
      eventName: "search_result_click",
      source: "client",
      campaign: "funnel",
      metadata: { group: row.group, query: q.trim().slice(0, 80), via: "keyboard" },
    });
    router.push(row.href);
    return true;
  }, [activeIdx, flatRows, q, router, saveRecent]);

  return (
    <div className="flex flex-col gap-4">
      {/* 큰 검색 입력 */}
      <div className="rise-in flex w-full max-w-[560px] items-center gap-2.5 rounded-2xl border-[1.5px] border-primary bg-surface px-4 py-3 text-ink shadow-[0_8px_28px_rgba(16,28,54,.08)]">
        <span aria-hidden className="text-[19px] text-text-3">
          ⌕
        </span>
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          {...compositionProps}
          onKeyDown={(e) => {
            /* [941] 한글 조합 중 방향키/Enter 는 IME 몫 — 가로채지 않는다 */
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" && flatRows.length > 0) {
              e.preventDefault();
              setActiveIdx((i) => Math.min(i + 1, flatRows.length - 1));
              return;
            }
            if (e.key === "ArrowUp" && flatRows.length > 0) {
              e.preventDefault();
              setActiveIdx((i) => Math.max(i - 1, -1));
              return;
            }
            if (e.key === "Escape") {
              setActiveIdx(-1);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              if (!openActive()) runSearch(q);
            }
          }}
          role="combobox"
          aria-controls="search-results"
          aria-expanded={flatRows.length > 0}
          aria-activedescendant={activeIdx >= 0 ? `search-opt-${activeIdx}` : undefined}
          placeholder="단지·매물·임장노트·이야기·뉴스 통합 검색"
          aria-label="통합 검색"
          autoComplete="off"
          /* [968 · 29] <form> 밖의 입력이라 iOS 자판에 "검색" 키가 없었다 — 힌트로 붙인다 */
          enterKeyHint="search"
          // 16px 미만 입력은 iOS 가 포커스 시 화면을 강제 줌한다(모바일 실측 7).
          // 모바일 16px, md+ 는 기존 15px 유지.
          className="w-full bg-transparent t-body text-ink outline-none placeholder:text-text-3 md:t-body"
        />
        {hasQuery && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 text-[13px] text-text-3"
            aria-label="검색어 지우기"
          >
            ✕
          </button>
        )}
      </div>

      {/* 검색↔지도 연동 (#9b) — 현재 검색어로 지도 이동 */}
      {hasQuery && (
        <Link
          href={`/map?q=${encodeURIComponent(q.trim())}`}
          onClick={() => saveRecent(q)}
          className="btn-soft rise-in inline-flex w-fit max-w-full items-center gap-1.5 rounded-xl px-3.5 py-2 t-body font-bold text-primary"
        >
          <Icon name="🗺" size={16} className="shrink-0" />
          {/* 띄어쓰기 없는 긴 검색어(최대 80자)도 390px 안에서 접힌다 — body 의 keep-all 이 낱말 안에서 끊지 않았다 */}
          <span className="min-w-0 break-all">‘{q.trim()}’ 지도에서 보기 ›</span>
        </Link>
      )}

      {/* 검색어 없음 — 최근·인기 검색 */}
      {!hasQuery && (
        <div className="rise-in mt-2 flex flex-col gap-5">
          {recent.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-extrabold text-text-3">최근 검색</span>
                <button
                  type="button"
                  onClick={() => {
                    setRecent([]);
                    writeRecentSearches([]);
                  }}
                  className="t-caption text-text-3 underline underline-offset-2"
                >
                  전체 삭제
                </button>
              </div>
              <div className="flex flex-wrap gap-[6px]">
                {recent.map((k) => (
                  <span
                    key={k}
                    className="chip flex items-center gap-1.5 border border-line bg-bg px-3 py-1.5 t-sub text-text-2"
                  >
                    <button type="button" onClick={() => runSearch(k)} className="font-semibold">
                      {k}
                    </button>
                    {/* [966] .tap — 12px ✕ 주변 8px 까지 눌린다(보이는 건 그대로) */}
                    <button
                      type="button"
                      onClick={() => removeRecent(k)}
                      aria-label={`최근 검색 ${k} 삭제`}
                      className="tap text-text-3"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-2 px-1 text-xs font-extrabold text-text-3">
              추천 지역{" "}
              <span className="font-medium text-text-3">(인기 순위 아님)</span>
            </div>
            <div className="flex flex-wrap gap-[6px]">
              {SUGGESTED_REGIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => runSearch(k)}
                  className="chip bg-bg px-3 py-1.5 t-sub text-text-2"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          {/* [937 검색] 많이 찾는 단지 — 실측 순위(최근 6개월 실거래 + 조회수).
              추천 지역과 달리 이건 진짜 측정값이라 근거를 그대로 적는다. */}
          {popular.length > 0 && (
            <div>
              <div className="mb-2 px-1 t-caption font-extrabold text-text-3">
                많이 찾는 단지{" "}
                <span className="font-medium">(최근 6개월 실거래·조회 기준)</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {popular.map((c) => (
                  <Link
                    key={c.id}
                    href={complexHrefFromId(c.id)}
                    onClick={() =>
                      trackPlatformEvent({
                        eventName: "search_popular_click",
                        source: "client",
                        campaign: "funnel",
                        metadata: { complexId: c.id },
                      })
                    }
                    className="card tile flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-body font-bold text-ink">{c.name}</div>
                      <div className="truncate t-caption text-text-3">
                        {c.regionName}
                        {c.recentTradeCount > 0 ? ` · 6개월 거래 ${c.recentTradeCount}건` : ""}
                      </div>
                    </div>
                    {c.avgPriceManwon != null && c.avgPriceManwon > 0 && (
                      <span className="shrink-0 t-sub font-bold text-text-2">
                        {/* [967 · 31] 단지 허브와 같은 "eok1" 얼굴 — 값은 bigint 라 만 분기 반올림 무영향 */}
                        {formatKrwManwon(c.avgPriceManwon, { style: "eok1" })}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 로딩 */}
      {hasQuery && busy && total === 0 && (
        <div className="mt-6 text-center text-[13px] text-text-3">검색 중…</div>
      )}

      {/* [1008 · 리뷰 B] 검색어가 너무 길다 — 장애도 결과 없음도 아니다 */}
      {hasQuery && !busy && notice && (
        <div role="status" className="mt-8 text-center t-section text-ink">
          {notice}
        </div>
      )}

      {/* 조회 실패 — "없음"이 아니라 "못 불러왔음"으로 적는다 */}
      {hasQuery && !busy && !notice && failed.length > 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="t-section text-ink">
            지금은 {failed.join("·")} 검색이 되지 않아요
          </div>
          <div className="t-sub text-text-3">
            결과가 없는 게 아니라 조회에 실패한 거예요. 잠시 후 다시 시도해 주세요.
          </div>
        </div>
      )}

      {/* 빈 결과 + A8 대안 단지 제안 */}
      {hasQuery && !busy && !notice && failed.length === 0 && total === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          {/* [1008 · S] 결과 없음 — 사실 한 줄 + 다음 할 일(띄어 쓰는 요령). 예전 문구("검색 결과가 없어요")는
              무엇을 바꿔 쳐야 하는지 말해 주지 않았다 — 결과 없음 82% 의 대부분이 띄어쓰기·괄호 차이였다. */}
          <div className="break-words t-section text-ink">{noMatchTitle(q.trim())}</div>
          <div className="break-words t-sub text-text-3">
            {NO_MATCH_HINT} · {NO_MATCH_EXAMPLE}
          </div>
          <div className="t-caption text-text-3">매물·임장노트·이웃 이야기·뉴스에서도 찾지 못했어요.</div>

          {/* 항목 13 — 막다른 화면 금지: 결과가 없어도 다음 행동은 있어야 한다.
              지도는 텍스트 매칭이 아니라 위치 탐색이라 같은 검색어로도 찾아질 수
              있고, 둘러보기·실거래 허브는 검색어 없이 시작하는 대안 경로다. */}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Link
              href={`/map?q=${encodeURIComponent(q.trim())}`}
              onClick={() => saveRecent(q)}
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-primary"
            >
              🗺 지도에서 찾기
            </Link>
            <Link
              href="/complex/browse"
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2"
            >
              단지 둘러보기
            </Link>
            <Link
              href="/tx"
              className="chip border border-line bg-bg px-3.5 py-2 t-sub font-bold text-text-2"
            >
              실거래가 허브
            </Link>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-5 w-full max-w-[520px] text-left">
              <div className="mb-2 px-1 t-body font-extrabold text-ink">
                혹시 이 단지를 찾으셨나요?{" "}
                <span className="t-caption font-semibold text-text-3">이름이 비슷한 단지</span>
              </div>
              <div className="flex flex-col gap-2">
                {suggestions.map((c) => (
                  <Link
                    key={c.id}
                    href={complexHrefFromId(c.id)}
                    className="card tile flex items-center justify-between gap-3 rounded-2xl px-4 py-3 no-underline"
                  >
                    <div className="min-w-0">
                      <div className="truncate t-section text-ink">
                        {c.name}
                      </div>
                      {c.region && (
                        <div className="truncate t-sub text-text-3">{complexMetaLine(c)}</div>
                      )}
                    </div>
                    <span className="shrink-0 t-body text-on-dark-muted">›</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* #413 — 커버리지 수요 수집: 무결과를 그냥 보내지 않고 확장 우선순위
              데이터로 바꾼다. 유사 단지 제안이 있어도 함께 보여준다(제안이
              틀렸을 수 있고, 지역 검색은 제안 자체가 안 뜬다). */}
          <CoverageRequestCard query={q.trim()} />
        </div>
      )}

      {/* 그룹별 결과 섹션 */}
      {hasQuery && total > 0 && (
        <div id="search-results" className="mt-1 flex flex-col gap-4">
          {/* [1007] 필터 줄 — 전체 + 결과가 있는 그룹(이야기·뉴스가 따로 선다). 40px 터치. */}
          {presentGroups.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="결과 종류">
              {[{ key: "all" as const, label: "전체", count: total }, ...presentGroups.map((g) => ({ key: g.key, label: g.label, count: g.rows.length }))].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={filter === t.key}
                  onClick={() => setFilter(t.key)}
                  className={`chip inline-flex min-h-10 items-center gap-1 rounded-full border px-3.5 py-2 t-sub font-bold ${
                    filter === t.key
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-surface text-text-2"
                  }`}
                >
                  {t.label}
                  <span className="t-caption font-semibold text-text-3">{t.count}</span>
                </button>
              ))}
            </div>
          )}
          {visibleGroups
            .map((g) => (
              <section key={g.key} className="rise-in card rounded-2xl p-[18px]">
                <header className="mb-1 flex items-center justify-between">
                  <div className="t-body font-extrabold text-ink">
                    {g.label} <span className="text-text-3">{g.rows.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {g.key === "complexes" && (
                      <Link
                        href={`/map?q=${encodeURIComponent(q.trim())}`}
                        onClick={() => saveRecent(q)}
                        className="t-sub font-bold text-primary"
                      >
                        지도 ›
                      </Link>
                    )}
                    <Link href={g.more} className="t-sub font-bold text-primary">
                      더 보기 ›
                    </Link>
                  </div>
                </header>
                <div className={g.key === "news" ? "news-list" : g.key === "stories" ? "mt-1 flex flex-col gap-2" : "flex flex-col"}>
                  {g.rows.map((r, i) => {
                    const optId = `search-opt-${flatIndexOf.get(`${g.key}:${r.id}`) ?? ""}`;
                    const active = flatIndexOf.get(`${g.key}:${r.id}`) === activeIdx;
                    const onClick = () => {
                      saveRecent(q);
                      /* [937 검색] 그룹별 클릭 실측 — 어떤 결과 묶음이 실제로
                         쓰이는지 없이는 검색 개선의 다음 순서를 정할 수 없다. */
                      trackPlatformEvent({
                        eventName: "search_result_click",
                        source: "client",
                        campaign: "funnel",
                        metadata: { group: g.key, query: q.trim().slice(0, 80) },
                      });
                    };
                    if (r.story) {
                      /* [1007] 이야기 — .story-card 축약: 머리글자 · 작성자 · 동네 배지 · 제목 · 댓글 */
                      const author = r.story.author.trim() || "이웃";
                      return (
                        <Link
                          key={r.id}
                          id={optId}
                          href={hrefFor(g.key, r.id)}
                          onClick={onClick}
                          className={`story-card tile flex min-h-10 flex-col gap-1.5 px-3 py-2.5 no-underline ${
                            active ? "border-primary" : ""
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="story-avatar" aria-hidden="true">
                              {author.slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1 truncate t-sub font-extrabold text-ink">{author}</span>
                            <span className="story-kind t-caption">이야기</span>
                          </span>
                          <span className="line-clamp-2 t-body font-extrabold leading-snug text-ink">
                            {highlightMatch(r.title, settledQuery)}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 t-sub text-text-3">
                            {r.story.region && (
                              <span className="rounded-md bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary">
                                {r.story.region}
                              </span>
                            )}
                            {r.story.createdAt && (
                              <time dateTime={r.story.createdAt}>{relativeTimeLabel(r.story.createdAt)}</time>
                            )}
                            {typeof r.story.commentCount === "number" && (
                              <span className="inline-flex items-center gap-1">
                                <Icon name="messages-square" size={12} />
                                댓글 {r.story.commentCount}
                              </span>
                            )}
                          </span>
                        </Link>
                      );
                    }
                    if (r.complex) {
                      /* [1008 · S] 단지 — 이름(검색어 강조: 괄호·띄어쓰기 건너뜀) + [비슷한 이름] ·
                         둘째 줄 시군구 읍면동 · 세대수 · 6개월 거래(같은 이름 단지 가르기) */
                      return (
                        <Link
                          key={r.id}
                          id={optId}
                          href={hrefFor(g.key, r.id)}
                          onClick={onClick}
                          className={`flex min-h-10 flex-col gap-0.5 rounded-lg py-2.5 transition-colors hover:text-primary ${
                            i < g.rows.length - 1 ? "border-b border-divider" : ""
                          } ${active ? "-mx-1.5 bg-primary-soft px-1.5" : ""}`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate t-body font-bold text-ink">
                              <Hl text={r.title} q={settledQuery} />
                            </span>
                            {r.complex.fuzzy && <FuzzyBadge />}
                          </span>
                          <span className="truncate t-sub text-text-3">{complexMetaLine(r.complex)}</span>
                        </Link>
                      );
                    }
                    if (r.news) {
                      /* [1007] 뉴스 — .news-row 축약: 출처 · 시각 → 제목. 카드가 아니라 구분선 행 */
                      return (
                        <Link
                          key={r.id}
                          id={optId}
                          href={hrefFor(g.key, r.id)}
                          onClick={onClick}
                          className={`news-row min-h-10 no-underline ${active ? "-mx-1.5 bg-primary-soft px-1.5" : ""}`}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="news-row__meta">
                              <span className="news-source">{r.news.source}</span>
                              {r.news.publishedAt && (
                                <time dateTime={r.news.publishedAt}>{relativeTimeLabel(r.news.publishedAt)}</time>
                              )}
                            </span>
                            <span className="news-row__title line-clamp-2">
                              {highlightMatch(r.title, settledQuery)}
                            </span>
                          </span>
                          <span aria-hidden="true" />
                        </Link>
                      );
                    }
                    return (
                      <Link
                        key={r.id}
                        id={optId}
                        href={hrefFor(g.key, r.id)}
                        onClick={onClick}
                        className={`flex items-center justify-between gap-3 rounded-lg py-2.5 transition-colors hover:text-primary ${
                          i < g.rows.length - 1 ? "border-b border-divider" : ""
                        } ${active ? "-mx-1.5 bg-primary-soft px-1.5" : ""}`}
                      >
                        <span className="min-w-0 truncate t-body font-bold text-ink">
                          {highlightMatch(r.title, settledQuery)}
                        </span>
                        {r.meta && (
                          <span className="shrink-0 t-sub text-text-3">{r.meta}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
