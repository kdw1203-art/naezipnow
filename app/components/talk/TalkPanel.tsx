"use client";

/* [1051 · 홈 실시간 토론] 지역(+단지) 한 줄 토론 판 — 네이버 증권 '오늘의 종목 토론 둘러보기'의 구성.
   소유자 지시(2026-10-09): "홈 하단에 이런 실시간 토론을 할 수 있는 창" · 답: 지역 + 단지 · 자동 소식 섞기 · 홈 창에서 바로 한 줄.

   왼쪽: 탭(토론 많은 · 상승 · 하락 · 거래량)별 수도권 지역 순위(/api/talk/board — 지수 전월비 · 매매 거래량 · 최근 7일 글 수).
   오른쪽: 고른 지역의 사람 글(최신 순, 위) + 자동 소식('소식' 표시 · 지수 · 거래 · 뉴스 · 임장노트, 아래).
   아래: 한 줄 쓰기(로그인) — 단지는 선택(그 지역 단지만). 보이는 동안 30초마다 새 글을 받는다.
   숫자는 적재된 것만 — 없는 값은 그 탭에서 빠진다(0 으로 세우지 않는다). 사람 글이 없을 때 지어낸 글로 채우지 않는다. */

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";
import { useToast } from "@/app/components/toast/ToastProvider";
import { Icon } from "@/app/components/Icon";
import {
  TALK_MAX_LEN,
  TALK_POLL_MS,
  TALK_TABS,
  complexInRegion,
  defaultTalkTab,
  mergeIncomingPosts,
  rankTalkBoard,
  signedPct,
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

  /* 토론 화면(/talk?region=…)은 주소의 지역으로 시작하고, 고른 지역을 주소에 적는다(공유 · 뒤로 가기) */
  useEffect(() => {
    if (variant !== "page") return;
    try {
      const q = new URLSearchParams(window.location.search).get("region");
      if (q) setRegionId(q);
    } catch {
      /* 주소 읽기 실패 — 1위 지역 */
    }
  }, [variant]);

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
    const t = window.setInterval(() => void loadBoard(), 120_000);
    return () => window.clearInterval(t);
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

  const loadFeed = useCallback(async (id: string, quiet: boolean) => {
    if (!quiet) setFeed({ status: "loading" });
    try {
      const r = await fetch(`/api/talk?region=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { regionId: string; posts: TalkPost[]; facts: TalkFact[]; factsFailed?: boolean };
      setFeed((cur) => ({
        status: "ok",
        regionId: j.regionId,
        posts: cur.status === "ok" && cur.regionId === j.regionId ? mergeIncomingPosts(cur.posts, j.posts) : j.posts,
        facts: j.facts,
        factsFailed: Boolean(j.factsFailed),
      }));
      setNow(Date.now());
    } catch {
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

  useEffect(() => {
    if (!selectedId || !visible) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadFeed(selectedId, true);
    }, TALK_POLL_MS);
    return () => window.clearInterval(t);
  }, [selectedId, visible, loadFeed]);

  /* 지역을 바꾸면 붙인 단지는 뗀다(다른 지역 단지) */
  useEffect(() => {
    setComplex(null);
    setComplexOpen(false);
    setComplexHits(null);
    setFormError(null);
  }, [selectedId]);

  /* 단지 붙이기 — 기존 검색 제안(/api/search/suggest) 중 이 지역 단지만 */
  useEffect(() => {
    if (!complexOpen || !selected) return;
    const q = complexQ.trim();
    if (q.length < 2) {
      setComplexHits(null);
      return;
    }
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        const j = (await r.json()) as { suggestions?: ComplexHit[] };
        const list = (j.suggestions ?? []).filter((s) => s && s.id && complexInRegion(s.region, selected.txName));
        setComplexHits(list.slice(0, 5));
      } catch {
        if (!ac.signal.aborted) setComplexHits([]);
      }
    }, 300);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [complexOpen, complexQ, selected]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selected || posting) return;
    const body = text.trim();
    if (body.length < 2) {
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
      void loadBoard();
    } catch {
      setFormError("글 저장 실패 · 잠시 후 다시");
    } finally {
      setPosting(false);
    }
  }

  async function remove(id: string) {
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
          {boardFailed && !board ? (
            <p className="m-0 px-3 py-6 text-center t-sub text-text-3">지역 순위 불러오기 실패 · 잠시 후 다시</p>
          ) : !board || !tab ? (
            <div className="flex flex-col gap-1 p-2" aria-busy="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : ranked.length === 0 ? (
            <p className="m-0 px-3 py-6 text-center t-sub text-text-3">
              {tab === "hot" ? "최근 7일 토론글 없음" : "이 기준의 지역 없음"}
            </p>
          ) : (
            <ol className={`m-0 list-none overflow-y-auto p-1 ${listMax}`}>
              {ranked.map((r, i) => {
                const v = valueOf(r, tab);
                const on = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRegionId(r.id)}
                      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left ${on ? "bg-primary-soft" : "hover:bg-bg"}`}
                    >
                      <span className="w-5 shrink-0 text-center t-sub font-bold tabular-nums text-text-3">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate t-sub font-bold text-ink">
                        {r.name}
                        <span className="ml-1 t-caption font-normal text-text-3">{r.sido}</span>
                      </span>
                      <span className={`shrink-0 t-sub font-bold tabular-nums ${v.cls}`}>{v.text}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* 오른쪽 — 고른 지역의 글 */}
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
            <span className="min-w-0 truncate t-body font-bold text-ink">{selected ? `${selected.name} 토론` : "지역 토론"}</span>
            {selected && (
              <Link href={`/region/${encodeURIComponent(selected.id)}`} className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
                지역 화면 ›
              </Link>
            )}
          </div>

          <div className={`min-h-[160px] flex-1 overflow-y-auto ${feedMax}`} aria-live="polite">
            {feed.status === "error" ? (
              <p className="m-0 px-3.5 py-8 text-center t-sub text-text-3">토론 불러오기 실패 · 잠시 후 다시</p>
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
                          className="inline-flex items-center gap-0.5 rounded bg-bg px-1.5 py-px t-caption font-bold text-text-2 no-underline"
                        >
                          <Icon name="building" size={12} />
                          {p.complexName}
                        </Link>
                      )}
                      <span className="ml-auto flex items-center gap-1">
                        {p.mine ? (
                          <button type="button" onClick={() => void remove(p.id)} className="inline-flex min-h-6 items-center px-1 t-caption text-text-3 hover:text-ink">
                            지우기
                          </button>
                        ) : loggedIn ? (
                          <button type="button" onClick={() => void report(p.id)} className="inline-flex min-h-6 items-center px-1 t-caption text-text-3 hover:text-ink">
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
                {feed.factsFailed && <li className="px-3.5 py-2 t-caption text-text-3">소식 불러오기 실패 · 잠시 후 다시</li>}
              </ul>
            )}
          </div>

          {/* 한 줄 쓰기 */}
          <div className="border-t border-line bg-bg px-3 py-2.5">
            {loggedIn === false ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="t-sub text-text-3">{selected ? `${selected.name} 이야기 한 줄 · 로그인 후 쓰기` : "로그인 후 쓰기"}</span>
                <Link href={`/login?callbackUrl=${encodeURIComponent(variant === "page" ? "/talk" : "/#talk")}`} className="btn-soft inline-flex min-h-10 items-center px-4 t-sub font-bold no-underline">
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
                      placeholder={selected ? `${selected.name} 단지 이름` : "단지 이름"}
                      aria-label="붙일 단지 검색"
                      className="min-h-10 w-full rounded-lg border border-line bg-surface px-3 t-sub text-ink"
                    />
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
                    onChange={(e) => setText(e.target.value.slice(0, TALK_MAX_LEN))}
                    maxLength={TALK_MAX_LEN}
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
                  <span className="tabular-nums">
                    {[...text].length}/{TALK_MAX_LEN}
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
