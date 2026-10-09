"use client";

/* [1051 · 홈 실시간 토론] 지역(+단지) 한 줄 토론 판 — 네이버 증권 '오늘의 종목 토론 둘러보기'의 구성.
   소유자 지시(2026-10-09): "홈 하단에 이런 실시간 토론을 할 수 있는 창" · 답: 지역 + 단지 · 자동 소식 섞기 · 홈 창에서 바로 한 줄.

   왼쪽: 탭(토론 많은 · 상승 · 하락 · 거래량)별 수도권 지역 순위(/api/talk/board — 지수 전월비 · 매매 거래량 · 최근 7일 글 수).
   오른쪽: 고른 지역의 사람 글(최신 순, 위) + 자동 소식('소식' 표시 · 지수 · 거래 · 뉴스 · 임장노트, 아래).
   아래: 한 줄 쓰기(로그인) — 단지는 선택(그 지역 단지만). 보이는 동안 30초마다 새 글을 받는다.
   숫자는 적재된 것만 — 없는 값은 그 탭에서 빠진다(0 으로 세우지 않는다). 사람 글이 없을 때 지어낸 글로 채우지 않는다.

   [1052 손질] 지역을 빨리 바꿀 때 늦게 온 앞 지역 응답이 화면을 덮던 것(요청 표 · 취소) · 지역 찾기 칸 · 고른 지역이 이 탭
   순위 밖이면 맨 위에 고정 줄 · 마지막 본 지역 기억(이 브라우저) · 왼쪽 순위도 보이는 동안만 다시 받기 · 올린 즉시 글 수 +1 ·
   아래로 내려 읽는 중 새 글이 오면 "새 글 N개 ↑" · 지우기·신고는 한 번 더 확인 · 폰 40px 누름 면 · 글자 수 180자부터 경고(글자 기준
   자르기) · 단지 찾기 칸 자동 초점·Esc · 화면 읽기 알림은 새 글 수만(목록 전체를 다시 읽지 않게) · 실패 칸에 다시 불러오기. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import {
  TALK_LAST_REGION_KEY,
  TALK_MAX_LEN,
  TALK_POLL_MS,
  TALK_TABS,
  bumpBoardTalk,
  clipTalkInput,
  complexInRegion,
  countFreshPosts,
  defaultTalkTab,
  filterTalkRegions,
  mergeIncomingPosts,
  rankTalkBoard,
  signedPct,
  talkCountTone,
  talkTimeLabel,
  ymMonthLabel,
  type TalkBoard,
  type TalkBoardRegion,
  type TalkFact,
  type TalkPost,
  type TalkTab,
} from "@/lib/talk/rules";

type FeedState =
  | { status: "idle" | "loading" }
  | { status: "ok"; regionId: string; posts: TalkPost[]; facts: TalkFact[]; factsFailed: boolean }
  | { status: "error" };

type ComplexHit = { id: string; name: string; region: string };

function valueOf(r: TalkBoardRegion, tab: TalkTab): { text: string; cls: string } {
  if (tab === "hot") return { text: `${r.talks}개`, cls: "text-ink" };
  if (tab === "volume") return { text: r.trades !== null ? `${r.trades.toLocaleString("ko-KR")}건` : "—", cls: "text-ink" };
  if (r.pct === null) return { text: "—", cls: "text-text-3" };
  return { text: signedPct(r.pct), cls: r.pct > 0.05 ? "text-up" : r.pct < -0.05 ? "text-down" : "text-ink" };
}

function valueHead(tab: TalkTab, board: TalkBoard | null): string {
  if (tab === "hot") return "최근 7일 글";
  if (tab === "volume") return board?.tradesYm ? `${ymMonthLabel(board.tradesYm)} 매매 거래` : "매매 거래";
  return board?.indexYm ? `${ymMonthLabel(board.indexYm)} 지수 전월비` : "지수 전월비";
}

export function TalkPanel({ variant = "home", initialRegion = null }: { variant?: "home" | "page"; initialRegion?: string | null }) {
  const { showToast } = useToast();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [board, setBoard] = useState<TalkBoard | null>(null);
  const [boardFailed, setBoardFailed] = useState(false);
  const [tab, setTab] = useState<TalkTab | null>(null);
  const [regionId, setRegionId] = useState<string | null>(initialRegion);
  const [feed, setFeed] = useState<FeedState>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [complex, setComplex] = useState<ComplexHit | null>(null);
  const [complexOpen, setComplexOpen] = useState(false);
  const [complexQ, setComplexQ] = useState("");
  const [complexHits, setComplexHits] = useState<ComplexHit[] | null>(null);
  const [visible, setVisible] = useState(true);
  const [q, setQ] = useState("");
  const [fresh, setFresh] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; kind: "remove" | "report" } | null>(null);
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const feedBoxRef = useRef<HTMLDivElement | null>(null);
  /* 가장 최근에 부탁한 지역 — 늦게 온 앞 지역 응답은 버린다 */
  const wantRef = useRef<string | null>(null);
  const feedAbortRef = useRef<AbortController | null>(null);
  /* 지금 화면의 글 목록(새 글 수 셈용) — setState 갱신 함수 안에서 세면 React 가 나중에 불러 0 이 된다 */
  const feedNowRef = useRef<FeedState>({ status: "idle" });
  useEffect(() => {
    feedNowRef.current = feed;
  }, [feed]);

  /* 토론 화면(/talk?region=…)은 주소의 지역으로 시작하고, 고른 지역을 주소에 적는다(공유 · 뒤로 가기).
     주소에 없으면(홈 포함) 이 브라우저에서 마지막으로 본 지역 — 없으면 탭 1위 */
  useEffect(() => {
    if (initialRegion) return;
    let fromUrl: string | null = null;
    if (variant === "page") {
      try {
        fromUrl = new URLSearchParams(window.location.search).get("region");
      } catch {
        /* 주소 읽기 실패 */
      }
    }
    if (fromUrl) {
      setRegionId(fromUrl);
      return;
    }
    try {
      const last = window.localStorage.getItem(TALK_LAST_REGION_KEY);
      if (last) setRegionId(last);
    } catch {
      /* 저장소 막힘 — 1위 지역 */
    }
  }, [variant, initialRegion]);

  const pickRegion = useCallback((id: string) => {
    setRegionId(id);
    setConfirm(null);
    try {
      window.localStorage.setItem(TALK_LAST_REGION_KEY, id);
    } catch {
      /* 저장소 막힘 — 기억만 못 한다 */
    }
    /* 폰(한 줄 배치)은 순위 아래에 글 칸이 있다 — 고르면 글 칸으로 */
    try {
      if (window.matchMedia("(max-width: 767px)").matches) feedBoxRef.current?.scrollIntoView({ block: "start" });
    } catch {
      /* 스크롤 실패 무시 */
    }
  }, []);

  const loadBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/talk/board");
      if (!r.ok) throw new Error(String(r.status));
      const b = (await r.json()) as TalkBoard;
      setBoard(b);
      setBoardFailed(false);
      setTab((t) => t ?? defaultTalkTab(b));
    } catch {
      setBoardFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    let alive = true;
    void getSessionLite().then((s) => {
      if (alive) setLoggedIn(Boolean(s?.user?.email));
    });
    return () => {
      alive = false;
    };
  }, []);

  /* 보이는 동안만 새 글을 받는다(화면 밖·다른 탭이면 멈춤) */
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => setVisible(es.some((e) => e.isIntersecting)), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const ranked = useMemo(() => (board && tab ? rankTalkBoard(board.regions, tab) : []), [board, tab]);
  const byId = useMemo(() => new Map((board?.regions ?? []).map((r) => [r.id, r])), [board]);
  /* 고른 지역이 없으면 이 탭의 1위 */
  const selected = (regionId ? byId.get(regionId) : undefined) ?? ranked[0] ?? null;
  /* 지역 찾기 — 찾는 중이면 이 탭 순위에 없는 지역도(순위 있는 것 먼저) */
  const shown = useMemo(() => {
    if (!board || !q.trim()) return ranked.map((r, i) => ({ r, rank: i + 1 as number | null }));
    const rankOf = new Map(ranked.map((r, i) => [r.id, i + 1]));
    return filterTalkRegions(board.regions, q)
      .map((r) => ({ r, rank: rankOf.get(r.id) ?? null }))
      .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.r.name.localeCompare(b.r.name, "ko"));
  }, [board, ranked, q]);

  const loadFeed = useCallback(async (id: string, quiet: boolean) => {
    wantRef.current = id;
    if (!quiet) {
      feedAbortRef.current?.abort();
      setFeed({ status: "loading" });
    }
    const ac = new AbortController();
    if (!quiet) feedAbortRef.current = ac;
    try {
      const r = await fetch(`/api/talk?region=${encodeURIComponent(id)}`, { cache: "no-store", signal: ac.signal });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { regionId: string; posts: TalkPost[]; facts: TalkFact[]; factsFailed?: boolean };
      /* 그 사이 다른 지역을 골랐으면 버린다 — 늦게 온 앞 지역 글이 새 지역 칸을 덮지 않게 */
      if (wantRef.current !== j.regionId) return;
      const before = feedNowRef.current;
      const added =
        quiet && before.status === "ok" && before.regionId === j.regionId
          ? countFreshPosts(new Set(before.posts.map((p) => p.id)), j.posts)
          : 0;
      setFeed((cur) => {
        const same = cur.status === "ok" && cur.regionId === j.regionId;
        return {
          status: "ok",
          regionId: j.regionId,
          posts: same ? mergeIncomingPosts(cur.posts, j.posts) : j.posts,
          facts: j.facts,
          factsFailed: Boolean(j.factsFailed),
        };
      });
      if (added > 0) {
        setAnnounce(`새 글 ${added}개`);
        /* 위에서 읽는 중이면 그대로 맨 위에 보인다 — 아래로 내려 읽는 중일 때만 알림 단추 */
        if ((feedScrollRef.current?.scrollTop ?? 0) > 40) setFresh((n) => n + added);
      }
      setNow(Date.now());
    } catch {
      if (ac.signal.aborted || wantRef.current !== id) return;
      if (!quiet) setFeed({ status: "error" });
    }
  }, []);

  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId) return;
    void loadFeed(selectedId, false);
    if (variant === "page") {
      try {
        window.history.replaceState(window.history.state, "", `/talk?region=${encodeURIComponent(selectedId)}`);
      } catch {
        /* 주소 갱신 실패는 무시 */
      }
    }
  }, [selectedId, loadFeed, variant]);

  /* 보이는 동안만 — 글은 30초, 왼쪽 순위는 2분마다. 다른 탭에서 돌아오면 바로 한 번 */
  useEffect(() => {
    if (!selectedId || !visible) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadFeed(selectedId, true);
    }, TALK_POLL_MS);
    const tb = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadBoard();
    }, 120_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadFeed(selectedId, true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      window.clearInterval(tb);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedId, visible, loadFeed, loadBoard]);

  /* 지역을 바꾸면 붙인 단지는 뗀다(다른 지역 단지) */
  useEffect(() => {
    setComplex(null);
    setComplexOpen(false);
    setComplexHits(null);
    setComplexQ("");
    setFormError(null);
    setFresh(0);
  }, [selectedId]);

  /* 단지 붙이기 — 기존 검색 제안(/api/search/suggest) 중 이 지역 단지만.
     지역 객체가 아니라 실거래 이름에 걸어 둔다(판을 다시 받을 때마다 객체가 바뀌어 같은 검색을 되풀이했다) */
  const selectedTx = selected?.txName ?? null;
  useEffect(() => {
    if (!complexOpen || !selectedTx) return;
    const cq = complexQ.trim();
    if (cq.length < 2) {
      setComplexHits(null);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(cq)}`, { signal: ac.signal });
        const j = (await r.json()) as { suggestions?: ComplexHit[] };
        const list = (j.suggestions ?? []).filter((s) => s && s.id && complexInRegion(s.region, selectedTx));
        setComplexHits(list.slice(0, 5));
      } catch {
        if (!ac.signal.aborted) setComplexHits([]);
      }
    }, 300);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [complexOpen, complexQ, selectedTx]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected || posting) return;
    const body = text.trim();
    if ([...body].length < 2) {
      setFormError("2자 이상");
      return;
    }
    setPosting(true);
    setFormError(null);
    try {
      const r = await fetch("/api/talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regionId: selected.id, body, complexId: complex?.id ?? null }),
      });
      const j = (await r.json().catch(() => ({}))) as { post?: TalkPost; error?: string };
      if (!r.ok || !j.post) {
        setFormError(j.error ?? "글 저장 실패 · 잠시 후 다시");
        return;
      }
      const post = j.post;
      setText("");
      setComplex(null);
      setComplexOpen(false);
      setFeed((cur) =>
        cur.status === "ok" && cur.regionId === selected.id
          ? { ...cur, posts: [post, ...cur.posts.filter((p) => p.id !== post.id)] }
          : cur,
      );
      setNow(Date.now());
      /* 판 응답은 CDN 30초 캐시 — 다시 받으면 옛 수가 온다. 이 화면에서 바로 +1 */
      setBoard((b) => (b ? bumpBoardTalk(b, selected.id, post.createdAt) : b));
      feedScrollRef.current?.scrollTo({ top: 0 });
    } catch {
      setFormError("글 저장 실패 · 잠시 후 다시");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
    setConfirm(null);
    const r = await fetch("/api/talk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    if (!r || !r.ok) {
      showToast("지우기 실패 · 잠시 후 다시");
      return;
    }
    setFeed((cur) => (cur.status === "ok" ? { ...cur, posts: cur.posts.filter((p) => p.id !== id) } : cur));
    showToast("글을 지웠어요");
  }

  async function report(id: string) {
    setConfirm(null);
    const r = await fetch("/api/talk/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, reason: "토론 신고" }),
    }).catch(() => null);
    if (!r || !r.ok) {
      showToast(r?.status === 401 ? "로그인 후 신고" : "신고 실패 · 잠시 후 다시");
      return;
    }
    const j = (await r.json().catch(() => ({}))) as { result?: string };
    if (j.result === "hidden") setFeed((cur) => (cur.status === "ok" ? { ...cur, posts: cur.posts.filter((p) => p.id !== id) } : cur));
    showToast(j.result === "already" ? "이미 신고한 글" : "신고를 접수했어요");
  }

  const listMax = variant === "page" ? "max-h-[560px]" : "max-h-[230px] md:max-h-[460px]";
  const feedMax = variant === "page" ? "max-h-[640px]" : "max-h-[460px]";
  const posts = feed.status === "ok" && feed.regionId === selectedId ? feed.posts : [];
  const facts = feed.status === "ok" && feed.regionId === selectedId ? feed.facts : [];
  const len = [...text].length;
  const tone = talkCountTone(len);
  /* 고른 지역이 지금 순위(찾기 결과)에 없으면 맨 위에 고정 줄 */
  const pinned = selected && !shown.some((x) => x.r.id === selected.id) ? selected : null;
  const loginBack = variant === "page" && selected ? `/talk?region=${encodeURIComponent(selected.id)}` : variant === "page" ? "/talk" : "/#talk";
  const smallBtn = "inline-flex min-h-[40px] items-center px-1.5 t-caption md:min-h-6";

  function regionRow(r: TalkBoardRegion, rank: number | null, pin: boolean) {
    if (!tab) return null;
    const v = valueOf(r, tab);
    const on = r.id === selectedId;
    return (
      <li key={pin ? `pin-${r.id}` : r.id} className={pin ? "border-b border-line pb-1" : undefined}>
        <button
          type="button"
          aria-pressed={on}
          onClick={() => pickRegion(r.id)}
          className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left ${on ? "bg-primary-soft" : "hover:bg-bg"}`}
        >
          <span className="w-5 shrink-0 text-center t-sub font-bold tabular-nums text-text-3">{rank ?? "·"}</span>
          <span className="min-w-0 flex-1 truncate t-sub font-bold text-ink">
            {r.name}
            <span className="ml-1 t-caption font-normal text-text-3">{pin ? `${r.sido} · ${q.trim() ? "고른 지역" : "이 순위 밖"}` : r.sido}</span>
          </span>
          <span className={`shrink-0 t-sub font-bold tabular-nums ${v.cls}`}>{v.text}</span>
        </button>
      </li>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {/* 탭 */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="지역 순위 기준">
        {TALK_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex min-h-10 items-center rounded-full px-3.5 t-sub font-bold ${
              tab === t.id ? "chip-active" : "border border-line bg-surface text-text-2"
            }`}
          >
            {t.label}
            {t.id === "hot" && board && board.totalTalks > 0 && <span className="ml-1 tabular-nums">{board.totalTalks}</span>}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        {/* 왼쪽 — 지역 순위 */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line bg-bg px-3 py-1.5 t-caption font-bold text-text-3">
            <span>지역</span>
            <span>{tab ? valueHead(tab, board) : ""}</span>
          </div>
          {board && (
            <div className="border-b border-line p-1.5">
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="지역 찾기 · 송파 · 분당"
                aria-label="지역 찾기"
                className="min-h-10 w-full rounded-lg border border-line bg-bg px-3 t-sub text-ink"
              />
            </div>
          )}
          {boardFailed && !board ? (
            <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
              <p className="m-0 t-sub text-text-3">지역 순위 불러오기 실패 · 잠시 후 다시</p>
              <button type="button" onClick={() => void loadBoard()} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold">
                다시 불러오기
              </button>
            </div>
          ) : !board || !tab ? (
            <div className="flex flex-col gap-1 p-2" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : shown.length === 0 && !pinned ? (
            <p className="m-0 px-3 py-6 text-center t-sub text-text-3">
              {q.trim() ? `'${q.trim()}' 지역 없음` : tab === "hot" ? "최근 7일 토론글 없음" : "이 기준의 지역 없음"}
            </p>
          ) : (
            <ol className={`m-0 list-none overflow-y-auto p-1 ${listMax}`}>
              {pinned && regionRow(pinned, null, true)}
              {shown.map((x) => regionRow(x.r, x.rank, false))}
            </ol>
          )}
        </div>

        {/* 오른쪽 — 고른 지역의 글 */}
        <div ref={feedBoxRef} className="flex min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
            <span className="min-w-0 truncate t-body font-bold text-ink">{selected ? `${selected.name} 토론` : "지역 토론"}</span>
            {selected && (
              <Link href={`/region/${encodeURIComponent(selected.id)}`} className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
                지역 화면 ›
              </Link>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {announce}
          </p>
          <div
            ref={feedScrollRef}
            onScroll={(e) => {
              if (fresh > 0 && e.currentTarget.scrollTop <= 40) setFresh(0);
            }}
            className={`relative min-h-[160px] flex-1 overflow-y-auto ${feedMax}`}
          >
            {fresh > 0 && (
              <div className="sticky top-1.5 z-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setFresh(0);
                    feedScrollRef.current?.scrollTo({ top: 0 });
                  }}
                  className="inline-flex min-h-[40px] items-center rounded-full border border-line bg-surface px-3.5 t-sub font-bold text-primary shadow-sm md:min-h-8"
                >
                  새 글 {fresh}개 ↑
                </button>
              </div>
            )}
            {!selected && board ? (
              <p className="m-0 px-3.5 py-8 text-center t-sub text-text-3">지역 선택 없음 · 순위에서 고르기</p>
            ) : feed.status === "error" ? (
              <div className="flex flex-col items-center gap-2 px-3.5 py-8 text-center">
                <p className="m-0 t-sub text-text-3">토론 불러오기 실패 · 잠시 후 다시</p>
                {selectedId && (
                  <button type="button" onClick={() => void loadFeed(selectedId, false)} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold">
                    다시 불러오기
                  </button>
                )}
              </div>
            ) : feed.status !== "ok" || feed.regionId !== selectedId ? (
              <div className="flex flex-col gap-2 p-3.5" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : posts.length === 0 && facts.length === 0 ? (
              <p className="m-0 px-3.5 py-8 text-center t-sub text-text-3">{selected?.name} 토론글 없음</p>
            ) : (
              <ul className="m-0 list-none p-0">
                {posts.length === 0 && (
                  <li className="border-b border-line bg-bg px-3.5 py-1.5 t-caption text-text-3">사람 글 없음 · 아래는 자동 소식</li>
                )}
                {posts.map((p) => (
                  <li key={p.id} className="border-b border-line px-3.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 t-caption text-text-3">
                      <span className="t-sub font-bold text-ink">{p.author}</span>
                      <span>{talkTimeLabel(p.createdAt, now)}</span>
                      {p.complexId && p.complexName && (
                        <Link
                          href={`/complex/${encodeURIComponent(p.complexId)}`}
                          className="inline-flex min-h-6 items-center gap-0.5 rounded bg-bg px-1.5 t-caption font-bold text-text-2 no-underline"
                        >
                          <Icon name="building" size={12} />
                          {p.complexName}
                        </Link>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        {confirm?.id === p.id ? (
                          <>
                            <span className="t-caption font-bold text-ink">{confirm.kind === "remove" ? "지울까요?" : "신고할까요?"}</span>
                            <button
                              type="button"
                              onClick={() => void (confirm.kind === "remove" ? remove(p.id) : report(p.id))}
                              className={`${smallBtn} font-bold text-danger`}
                            >
                              {confirm.kind === "remove" ? "지우기" : "신고"}
                            </button>
                            <button type="button" onClick={() => setConfirm(null)} className={`${smallBtn} text-text-3 hover:text-ink`}>
                              그만두기
                            </button>
                          </>
                        ) : p.mine ? (
                          <button type="button" onClick={() => setConfirm({ id: p.id, kind: "remove" })} className={`${smallBtn} text-text-3 hover:text-ink`}>
                            지우기
                          </button>
                        ) : loggedIn ? (
                          <button type="button" onClick={() => setConfirm({ id: p.id, kind: "report" })} className={`${smallBtn} text-text-3 hover:text-ink`}>
                            신고
                          </button>
                        ) : null}
                      </span>
                    </div>
                    <p className="m-0 mt-0.5 whitespace-pre-wrap break-words t-body text-text-1">{p.body}</p>
                  </li>
                ))}
                {facts.map((f) => (
                  <li key={f.id} className="border-b border-line px-3.5 py-2 last:border-b-0">
                    <div className="flex items-center gap-1.5 t-caption text-text-3">
                      <span className="inline-flex items-center gap-0.5 rounded bg-success-soft px-1.5 py-px font-bold text-success">
                        <Icon name="check" size={11} />
                        소식
                      </span>
                      <span className="font-bold text-text-2">{f.label}</span>
                      {f.source && <span className="truncate">{f.source}</span>}
                      {f.at && <span className="shrink-0">· {talkTimeLabel(f.at, now)}</span>}
                    </div>
                    {f.href ? (
                      <Link
                        href={f.href}
                        className={`mt-0.5 block t-sub no-underline ${f.tone === "up" ? "text-up" : f.tone === "down" ? "text-down" : "text-text-1"}`}
                      >
                        <span className="line-clamp-2">{f.text}</span>
                      </Link>
                    ) : (
                      <p className="m-0 mt-0.5 t-sub text-text-1">{f.text}</p>
                    )}
                  </li>
                ))}
                {feed.factsFailed && (
                  <li className="px-3.5 py-2 t-caption text-text-3">{facts.length > 0 ? "일부 소식 불러오기 실패 · 잠시 후 다시" : "소식 불러오기 실패 · 잠시 후 다시"}</li>
                )}
              </ul>
            )}
          </div>

          {/* 한 줄 쓰기 */}
          <div className="border-t border-line bg-bg px-3 py-2.5">
            {loggedIn === false ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-sub text-text-3">{selected ? `${selected.name} 이야기 한 줄 · 로그인 후 쓰기` : "로그인 후 쓰기"}</span>
                <Link href={`/login?callbackUrl=${encodeURIComponent(loginBack)}`} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold no-underline">
                  로그인
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-2">
                {complexOpen && (
                  <div className="flex flex-col gap-1">
                    <input
                      value={complexQ}
                      onChange={(e) => setComplexQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setComplexOpen(false);
                          setComplexQ("");
                          setComplexHits(null);
                        }
                      }}
                      autoFocus
                      placeholder={selected ? `${selected.name} 단지 이름` : "단지 이름"}
                      aria-label="붙일 단지 검색"
                      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 t-sub text-ink"
                    />
                    {!complexHits && complexQ.trim().length < 2 && (
                      <span className="px-1 t-caption text-text-3">2자 이상 · 이 지역 단지만 · Esc 닫기</span>
                    )}
                    {complexHits && (
                      <ul className="m-0 list-none rounded-lg border border-line bg-surface p-1">
                        {complexHits.length === 0 ? (
                          <li className="px-2 py-2 t-caption text-text-3">이 지역 단지 없음</li>
                        ) : (
                          complexHits.map((h) => (
                            <li key={h.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setComplex(h);
                                  setComplexOpen(false);
                                  setComplexQ("");
                                  setComplexHits(null);
                                }}
                                className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left t-sub hover:bg-bg"
                              >
                                <Icon name="building" size={14} />
                                <span className="min-w-0 flex-1 truncate font-bold text-ink">{h.name}</span>
                                <span className="shrink-0 t-caption text-text-3">{h.region}</span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  {complex ? (
                    <button
                      type="button"
                      onClick={() => setComplex(null)}
                      aria-label={`${complex.name} 떼기`}
                      className="inline-flex min-h-10 max-w-[40%] shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2 t-caption font-bold text-text-2"
                    >
                      <span className="truncate">{complex.name}</span>
                      <Icon name="x" size={12} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setComplexOpen((v) => !v)}
                      aria-expanded={complexOpen}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 t-caption font-bold text-text-2"
                    >
                      <Icon name="building" size={13} />
                      단지
                    </button>
                  )}
                  <input
                    value={text}
                    onChange={(e) => setText(clipTalkInput(e.target.value))}
                    disabled={!selected || loggedIn === null}
                    placeholder={selected ? `${selected.name} 이야기 한 줄` : "지역을 고르면 쓰기"}
                    aria-label="토론 한 줄"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 t-body text-ink"
                  />
                  <button type="submit" disabled={posting || !selected || text.trim().length < 2} className="btn-primary inline-flex min-h-10 shrink-0 items-center px-4 t-sub">
                    {posting ? "올리는 중" : "올리기"}
                  </button>
                </div>
                <div className="flex items-center justify-between t-caption text-text-3">
                  <span role={formError ? "alert" : undefined} className={formError ? "font-bold text-danger" : ""}>
                    {formError ?? "새 글은 30초마다"}
                  </span>
                  <span className={`tabular-nums ${tone === "full" ? "font-bold text-danger" : tone === "warn" ? "font-bold text-warning" : ""}`}>
                    {tone === "ok" ? `${len}/${TALK_MAX_LEN}` : `${TALK_MAX_LEN - len}자 남음`}
                  </span>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TalkPanel;
