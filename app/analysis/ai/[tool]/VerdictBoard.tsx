"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { Verdict } from "@/lib/ai/verdict";
import {
  BOARD_TOOLS,
  BOARD_TOOL_LABEL,
  boardConsensus,
  isBoardToolId,
  summarizeForBoard,
  type BoardItem,
  type BoardSummary,
  type BoardToolId,
} from "@/lib/ai/verdict-board";
import { verdictNextActions } from "@/lib/ai/next-action-routing";
import { hasSession } from "@/lib/client/has-session";
import { SkBlock } from "@/app/components/ui/Skeleton";

/* ============================================================
   [996] 판단 카드 곁의 세 조각 — 전부 이 파일에 두고 next/dynamic(ssr:false)으로
   받는다. 워크벤치 라우트 예산(480KB)에 본체가 477KB 라 페이지 번들에는 dynamic
   선언 세 줄만 남긴다. 판단 카드 자체가 클라이언트 fetch 뒤에 서므로 SSR 손실이 없다.

   ① VerdictNextActions — 판단 아래 "다음 행동 두 개", 항상 같은 자리.
   ② VerdictBoard       — 같은 단지, 네 가지 눈(진단·예측·타이밍·리스크) 미니 카드.
   ③ MyNotesChip        — 근거 칩 "내 임장노트 n건" (로그인 사용자만, private API).
   값은 전부 서버가 만든 판단 카드에서 옮긴다 — 여기서 계산하는 수치는 없다.
   ============================================================ */

/* ── ① 다음 행동 두 개 ─────────────────────────────────────────────────── */

export function VerdictNextActions({
  tool,
  verdict,
  complexId,
  complexName,
  region,
}: {
  tool: AiAnalysisToolId;
  verdict: Verdict | null;
  complexId: string | null;
  complexName?: string | null;
  region?: string | null;
}) {
  const a = verdictNextActions({ tool, verdict, complexId, complexName, region });
  return (
    <div className="flex flex-wrap gap-2" aria-label="다음 행동">
      <Link href={a.primary.href} className="tool-fill press btn-md no-underline" title={a.primary.hint}>
        {a.primary.label} ›
      </Link>
      {a.secondary && (
        <Link href={a.secondary.href} className="btn-secondary btn-md no-underline">
          {a.secondary.label}
        </Link>
      )}
    </div>
  );
}

/* ── ② 같은 단지, 네 가지 눈 ────────────────────────────────────────────── */

type Tile = { status: "loading" } | { status: "ok"; item: BoardSummary } | { status: "fail" };

/* 컨텍스트 API 의 서버 캐시(5분)와 같은 수명 — 보드가 살아 있는 동안 단지를 오가도
   같은 도구·단지를 다시 받지 않는다. */
const TILE_TTL_MS = 5 * 60 * 1000;

export function VerdictBoard({
  tool,
  complexId,
  complexName,
  region,
  verdict,
}: {
  tool: AiAnalysisToolId;
  complexId: string;
  complexName?: string | null;
  region?: string | null;
  /** 현재 도구의 판단 카드 — 다시 받지 않고 그대로 쓴다(없으면 로딩 칸) */
  verdict: Verdict | null;
}) {
  const cacheRef = useRef(new Map<string, { at: number; item: BoardSummary }>());
  const [tiles, setTiles] = useState<Partial<Record<BoardToolId, Tile>>>({});

  useEffect(() => {
    const ac = new AbortController();
    const next: Partial<Record<BoardToolId, Tile>> = {};
    const missing: BoardToolId[] = [];
    const now = Date.now();
    for (const t of BOARD_TOOLS) {
      if (t === tool) continue;
      const hit = cacheRef.current.get(`${complexId}|${t}`);
      if (hit && now - hit.at < TILE_TTL_MS) next[t] = { status: "ok", item: hit.item };
      else {
        next[t] = { status: "loading" };
        missing.push(t);
      }
    }
    setTiles(next);
    /* 세 도구를 병렬로 — 같은 단지라 서버 컨텍스트는 한 번만 만들고(5분 캐시) 판단만 도구별로 조립된다 */
    for (const t of missing) {
      const qs =
        `complexId=${encodeURIComponent(complexId)}&tool=${encodeURIComponent(t)}` +
        (region ? `&region=${encodeURIComponent(region)}` : "");
      fetch(`/api/ai/context?${qs}`, { cache: "no-store", signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (ac.signal.aborted) return;
          const item = j?.ok && j.verdict ? summarizeForBoard(j.verdict, { stripName: complexName ?? undefined }) : null;
          if (item) cacheRef.current.set(`${complexId}|${t}`, { at: Date.now(), item });
          setTiles((prev) => ({ ...prev, [t]: item ? { status: "ok", item } : { status: "fail" } }));
        })
        .catch(() => {
          /* 중단(단지 변경)은 실패가 아니다 — 새 단지의 effect 가 칸을 다시 채운다 */
          if (!ac.signal.aborted) setTiles((prev) => ({ ...prev, [t]: { status: "fail" } }));
        });
    }
    return () => ac.abort();
  }, [complexId, region, tool, complexName]);

  const own: Tile | null = isBoardToolId(tool)
    ? verdict
      ? { status: "ok", item: summarizeForBoard(verdict, { stripName: complexName ?? undefined }) }
      : { status: "loading" }
    : null;
  const tileOf = (t: BoardToolId): Tile => (t === tool && own ? own : (tiles[t] ?? { status: "loading" }));

  const resolved: BoardItem[] = BOARD_TOOLS.flatMap((t) => {
    const x = tileOf(t);
    return x.status === "ok" ? [{ tool: t, band: x.item.band, bandLabel: x.item.bandLabel }] : [];
  });
  const consensus = boardConsensus(resolved);

  return (
    <section className="card flex flex-col gap-2 rounded-2xl p-4" aria-label="같은 단지, 네 가지 눈">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <span className="t-body font-extrabold text-ink">같은 단지, 네 가지 눈</span>
        <span className="t-caption text-text-3">구간만 세어 요약 · 각 칸은 그 도구로</span>
      </div>
      {/* 합의 한 줄 — 둘 이상 도착했을 때만. 한 눈으로 "합의"를 말하지 않는다. */}
      {consensus && (
        <p className="t-sub font-bold text-text-2" aria-live="polite">
          {consensus.line}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {BOARD_TOOLS.map((t) => {
          const x = tileOf(t);
          const current = t === tool;
          if (x.status === "loading") return <SkBlock key={t} h={76} className="rounded-[12px]" />;
          if (x.status === "fail")
            return (
              <div key={t} className="flex min-h-10 flex-col justify-center rounded-[12px] border border-dashed border-line px-3 py-2.5">
                <span className="t-caption font-extrabold text-text-3">{BOARD_TOOL_LABEL[t]}</span>
                <span className="t-sub text-text-3">지금은 못 받았어요</span>
              </div>
            );
          const body = (
            <>
              <span className="flex items-center justify-between gap-1">
                <span className="t-caption font-extrabold text-text-3">{BOARD_TOOL_LABEL[t]}</span>
                <span className="verdict-band shrink-0 rounded-md px-1.5 py-px t-caption font-extrabold" data-band={x.item.band}>
                  {x.item.bandLabel}
                </span>
              </span>
              <span className="truncate t-sub font-bold text-ink">{x.item.headline}</span>
              {x.item.metric && (
                <span className="truncate t-caption tabular-nums text-text-2">
                  {x.item.metric.label}{" "}
                  <b className="text-ink">
                    {x.item.metric.value}
                    {x.item.metric.unit ?? ""}
                  </b>
                </span>
              )}
            </>
          );
          /* 현재 도구 칸은 자기 자신으로 가는 링크가 아니라 표식이다 */
          return current ? (
            <div
              key={t}
              aria-current="page"
              className="tool-soft-bg flex min-h-10 flex-col gap-1 rounded-[12px] border-2 px-3 py-2.5"
              style={{ borderColor: "var(--tool-accent)" }}
            >
              {body}
            </div>
          ) : (
            <Link
              key={t}
              href={`/analysis/ai/${t}?complexId=${encodeURIComponent(complexId)}`}
              className="press flex min-h-10 flex-col gap-1 rounded-[12px] border border-line bg-surface px-3 py-2.5 no-underline"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── ③ 내 임장노트 칩 ─────────────────────────────────────────────────── */

type MyNotes = { count: number; score: number | null; latestId: string };

/* 브라우저 안 메모리라 다른 사람과 섞이지 않는다 — 공유 컨텍스트 캐시에는 절대 넣지 않는다 */
const myNotesCache = new Map<string, MyNotes | null>();

export function MyNotesChip({ complexId }: { complexId: string }) {
  const [my, setMy] = useState<MyNotes | null>(null);
  useEffect(() => {
    let cancelled = false;
    const hit = myNotesCache.get(complexId);
    if (hit !== undefined) {
      setMy(hit);
      return;
    }
    setMy(null);
    /* 게스트는 401 을 맞으러 가지 않는다(hasSession 은 공유 프라미스 — 요청이 늘지 않는다) */
    void hasSession()
      .then((signedIn) =>
        signedIn
          ? fetch(`/api/me/complex-records?complexId=${encodeURIComponent(complexId)}`, { cache: "no-store" }).then((r) =>
              r.ok ? r.json() : null,
            )
          : null,
      )
      .then((j) => {
        if (cancelled) return;
        const notes: { id: string; avgScore: number | null }[] = Array.isArray(j?.notes) ? j.notes : [];
        const scored = notes.map((n) => n.avgScore).filter((s): s is number => typeof s === "number");
        const v: MyNotes | null = notes.length
          ? {
              count: notes.length,
              /* 내 노트 점수의 평균 — 이웃 노트 avgScore 와 같은 계산. 점수 없는 노트뿐이면 비운다 */
              score: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
              latestId: notes[notes.length - 1].id,
            }
          : null;
        if (j) myNotesCache.set(complexId, v);
        setMy(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [complexId]);
  if (!my) return null;
  /* 다른 근거 칩과 같은 꼴 — 칩은 span, 링크는 안쪽 24px 인라인("원본" 과 동일 규격) */
  return (
    <span
      className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 t-caption text-text-2"
      title="내가 이 단지에 남긴 임장노트(비공개 포함)"
    >
      <b className="font-extrabold text-text-1">내 임장노트</b>
      <span>
        {my.count}건{my.score != null ? ` · ${my.count > 1 ? "평균" : "기록"} ${my.score}점` : ""}
      </span>
      <Link
        href={`/notes/${my.latestId}`}
        className="inline-flex min-h-[24px] min-w-[28px] items-center justify-center px-1 font-bold text-primary no-underline"
      >
        최근 것
      </Link>
    </span>
  );
}
