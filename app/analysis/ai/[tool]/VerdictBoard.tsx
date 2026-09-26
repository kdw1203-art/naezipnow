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
import { hasSession } from "@/lib/client/has-session";
import { useHumanGate } from "@/lib/client/human-gate";
import { SkBlock } from "@/app/components/ui/Skeleton";

/* ============================================================
   [996] 결과 곁의 조각 — 전부 이 파일에 두고 next/dynamic(ssr:false)으로 받는다(워크벤치 예산 480KB).

   ② VerdictBoard — [1008 · W] "다른 도구로 본 이 단지"(예전 이름 "같은 단지, 네 가지 눈" — 내부 말이었다).
                    진단·예측·타이밍·리스크 점검의 결론을 미니 카드로. 각 칸은 그 도구로 가는 링크.
   ③ MyNotesChip  — 데이터 출처 옆 "내 임장노트 n건" (로그인 사용자만, private API).
   값은 전부 서버가 만든 결과 요약에서 옮긴다 — 여기서 계산하는 수치는 없다.
   (① 다음 행동 두 개는 [1008] 결과 화면의 "다음 할 일 3개"(ResultView)로 합쳤다.)
   ============================================================ */

/* ── ② 다른 도구로 본 이 단지 ─────────────────────────────────────────────── */

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
  /* [1007 · V2a-4] 보드는 판단 카드 **아래**에 있다 — 마운트 즉시 도구 3종을 부르지 않고, 봇이 아닌
     사람이 이 섹션을 뷰포트에 들이거나 첫 상호작용을 한 뒤에 부른다(lib/client/human-gate).
     실측 /api/ai/context 1,215회/일의 대부분이 크롤러가 칸 링크(?complexId=)를 따라다니며
     단지마다 여기서 3회 + 워크벤치 딥링크 1회를 일으킨 것이다. 그 전까지는 스켈레톤이다. */
  const sectionRef = useRef<HTMLElement | null>(null);
  const armed = useHumanGate(sectionRef);

  useEffect(() => {
    if (!armed) return;
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
  }, [armed, complexId, region, tool, complexName]);

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
    <section ref={sectionRef} className="card flex flex-col gap-2 rounded-2xl p-4" aria-label="다른 도구로 본 이 단지">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 className="t-section font-extrabold text-ink">다른 도구로 본 이 단지</h2>
        <span className="t-caption text-text-3">칸을 누르면 그 도구로 이어서 봐요</span>
      </div>
      {/* 합의 한 줄 — 둘 이상 도착했을 때만. 한 도구로 "합의"를 말하지 않는다. */}
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
                <span className="t-sub text-text-3">지금은 불러오지 못했어요</span>
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
    /* [1009 · A] title= 말풍선(마우스를 올려야만 보임)을 걷고 "비공개 포함"을 글자로 — 휴대폰에서도 읽힌다 */
    <span className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 t-caption text-text-2">
      <b className="font-extrabold text-text-1">내 임장노트</b>
      <span className="text-text-3">(비공개 포함)</span>
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
