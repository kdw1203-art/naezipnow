"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUpgradePaywall } from "@/app/components/UpgradePaywallProvider";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { fetchMyNotesShared } from "./hub-viewer";

/* ============================================================
   임장노트 AI 분석 카드 — 내 노트 선택 → POST /api/inspection/ai (noteId)
   결과: 노트 점수·텍스트 + 지역 실시세 스냅샷을 합친
   강점/약점/확인 필요/총평 을 .ai-panel 로 표시.
   라벨: LLM 성공 시 "AI 생성", 폴백 시 "규칙 기반 요약".
   401 → 로그인 안내 · 429 → 사용량 안내 (10회/시간)

   [v4 · 한 화면 한 가지] 허브 "내 임장노트" 목록의 **"임장노트 분석" 행을 펼치면** 나오는 몸통이 됐다
   (hub-picker.tsx). 그래서 카드 테두리·아이콘 타일·제목·설명 문장을 걷었다 — 행의 이름·보조 줄이 이미 말한다
   (카드 안에 카드 금지). 실행 단추는 채움 파랑 → 테두리(btn-outline): 화면의 채움 파랑은 검색 하나.
   게스트·노트 0편일 때는 누를 수 없는 단추를 세워 두지 않고 할 일 한 줄(로그인 ›·첫 노트 쓰기 ›)만 둔다.
   AI 결과 판(ai-panel)·"AI 생성/규칙 기반" 라벨·면책 한 줄은 그대로다.
   ============================================================ */

type NoteOption = {
  id: string;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
};

type AiResult = {
  mode: "llm" | "rule";
  cached: boolean;
  headline: string;
  verdict: string;
  strengths: string[];
  risks: string[];
  followUps: string[];
  marketSummary: string | null;
  disclaimer: string;
};

type CardState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AiResult }
  | { kind: "login" }
  | { kind: "quota"; message: string; upgrade: boolean }
  | { kind: "error"; message: string };

const DISCLAIMER = "본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다";

export function AiNoteAnalysisCard({
  noteId,
  loggedIn = true,
  seedComplexName = null,
  seedRegionId = null,
  seedRegionLabel = null,
}: {
  noteId?: string | null;
  loggedIn?: boolean;
  /** 허브 단지 선택기에서 고른 단지명 — 컨텍스트 배너 표시 */
  seedComplexName?: string | null;
  /** 고른 단지 지역의 regionId — 실시세 스냅샷 프리필 */
  seedRegionId?: string | null;
  /** 고른 단지 지역 라벨 — 매칭 노트 자동 선택 */
  seedRegionLabel?: string | null;
}) {
  const { handleUpgradeResponse } = useUpgradePaywall();
  const { promptSignup } = useSoftSignup();
  const [state, setState] = useState<CardState>({ kind: "idle" });
  const [notes, setNotes] = useState<NoteOption[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [selected, setSelected] = useState<string>(noteId ?? "");
  const [seedSnap, setSeedSnap] = useState<{ avgSaleLabel: string; period: string } | null>(
    null,
  );

  useEffect(() => {
    if (!loggedIn) {
      setNotesLoaded(true);
      setState({ kind: "login" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        /* [1007] 허브의 시작 카드·티저와 **같은 공유 프라미스** — 한 페이지에 /api/inspection/notes 1회 */
        const items = (await fetchMyNotesShared()) ?? [];
        if (cancelled) return;
        setNotes(
          items.map((n) => ({
            id: n.id,
            title: n.title,
            region: n.region,
            aptName: n.aptName ?? null,
            visitDate: n.visitDate,
          })),
        );
        // ?noteId= 컨텍스트가 없으면 최신 노트를 기본 선택
        setSelected((prev) => prev || items[0]?.id || "");
      } catch {
        if (!cancelled) setNotes([]);
      } finally {
        if (!cancelled) setNotesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  // 선택 단지 지역의 실시세 스냅샷 프리필 (컨텍스트 배너)
  useEffect(() => {
    if (!seedRegionId) {
      setSeedSnap(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/ai/market-baseline?regionId=${encodeURIComponent(seedRegionId)}`,
        );
        const d = (await res.json().catch(() => null)) as
          | { available?: boolean; avgSaleLabel?: string; period?: string }
          | null;
        if (cancelled) return;
        setSeedSnap(
          d?.available && d.avgSaleLabel
            ? { avgSaleLabel: d.avgSaleLabel, period: d.period ?? "" }
            : null,
        );
      } catch {
        if (!cancelled) setSeedSnap(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [seedRegionId]);

  // 고른 단지 지역과 일치하는 노트가 있으면 자동 선택
  useEffect(() => {
    if (!seedRegionLabel || notes.length === 0) return;
    const key = seedRegionLabel.replace(/^서울\s*/, "").trim();
    const match = notes.find(
      (n) => n.region && (seedRegionLabel.includes(n.region) || n.region.includes(key)),
    );
    if (match) setSelected(match.id);
  }, [seedRegionLabel, notes]);

  const run = async (force = false) => {
    if (state.kind === "running" || !selected) return;
    setState({ kind: "running" });
    try {
      const res = await fetch("/api/inspection/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: selected, ...(force ? { force: true } : {}) }),
      });
      if (res.status === 401) {
        setState({ kind: "login" });
        promptSignup({
          action: "ai_note_analysis",
          title: "AI 분석을 이어가려면 로그인",
          benefit: "가입하면 내 임장노트를 AI(또는 규칙 초안)로 정리할 수 있어요.",
          callbackUrl: "/analysis",
        });
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        code?: string;
        requiredTier?: string;
        mode?: string;
        cached?: boolean;
        report?: {
          headline?: string;
          verdict?: string;
          summary?: string;
          strengths?: string[];
          risks?: string[];
          followUps?: string[];
        };
        marketContext?: { summary?: string } | null;
        disclaimer?: string;
      } | null;
      if (res.status === 429 || res.status === 403 || res.status === 402) {
        const upgrade =
          res.status === 402 ||
          (res.status === 403 &&
            (data?.code === "QUOTA_EXCEEDED" || data?.code === "TIER"));
        if (upgrade) handleUpgradeResponse(res.status, data);
        setState({
          kind: "quota",
          message:
            data?.error ??
            "AI 분석 사용량을 모두 썼어요. 잠시 후 다시 시도해 주세요.",
          upgrade,
        });
        return;
      }
      if (!res.ok || !data?.report) {
        setState({
          kind: "error",
          message: data?.error ?? "분석에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
        return;
      }
      const r = data.report;
      setState({
        kind: "done",
        result: {
          mode: data.mode === "llm" ? "llm" : "rule",
          cached: data.cached === true,
          headline: r.headline?.trim() || "임장노트 AI 분석 결과",
          verdict: (r.verdict ?? r.summary ?? "").trim(),
          strengths: (r.strengths ?? []).slice(0, 3),
          risks: (r.risks ?? []).slice(0, 3),
          followUps: (r.followUps ?? []).slice(0, 3),
          marketSummary: data.marketContext?.summary ?? null,
          disclaimer: data.disclaimer ?? DISCLAIMER,
        },
      });
    } catch {
      setState({
        kind: "error",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
      });
    }
  };

  const canRun = loggedIn && notesLoaded && notes.length > 0;

  return (
    <div className="flex flex-col gap-2.5">
      {/* 노트 선택 */}
      {notesLoaded && notes.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="t-sub font-bold text-text-3">분석할 노트</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface px-2.5 py-2 t-sub font-bold text-ink"
          >
            {notes.map((n) => (
              <option key={n.id} value={n.id}>
                {(n.aptName ? `${n.aptName} · ` : "") + n.title} — {n.region}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* 허브 검색에서 고른 단지 컨텍스트 (실시세 프리필) — 배지 없이 사실 한 줄 */}
      {seedComplexName && (
        <p className="t-sub text-text-2">
          <b className="text-ink">{seedComplexName}</b>
          {seedRegionLabel ? ` · ${seedRegionLabel}` : ""}
          {seedSnap ? ` · 평균 ${seedSnap.avgSaleLabel}${seedSnap.period ? ` (${seedSnap.period})` : ""}` : ""}
        </p>
      )}
      {loggedIn && notesLoaded && notes.length === 0 && state.kind !== "login" && (
        <div className="flex items-center justify-between gap-2">
          <span className="t-sub text-text-2">분석할 임장노트 없음</span>
          <Link href="/notes/new" className="tap-line shrink-0 t-sub font-bold text-primary">
            첫 노트 쓰기 ›
          </Link>
        </div>
      )}

      {state.kind === "done" ? (
        <div className="ai-panel flex flex-col gap-2 rounded-lg p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="t-sub font-bold text-on-dark">
              {state.result.headline}
            </span>
            {/* [1009 · A] 팔레트 색(emerald·amber) → 판 토큰, title= 말풍선(마우스를 올려야만 보임) 제거 —
                규칙 요약일 때의 설명은 바로 아래 줄에 글자로 있다. 이 판의 날것 rgba 4곳·text-white 2곳도
                on-dark 토큰으로, "다시 시도"(높이 약 20px)는 40px 로 */}
            <span
              className={`shrink-0 rounded border border-on-dark-faint bg-on-dark-panel px-1.5 py-0.5 t-caption font-bold ${
                state.result.mode === "llm" ? "text-ai-success" : "text-ai-muted"
              }`}
            >
              {state.result.mode === "llm" ? "AI 생성 · LLM" : "규칙 기반 요약 · LLM 아님"}
            </span>
          </div>
          {state.result.cached && (
            <div className="t-caption font-bold text-ai-muted">
              노트 내용이 그대로라 저장된 분석을 다시 보여드려요. 새로 분석하려면
              &quot;다시 분석하기&quot;를 누르세요.
            </div>
          )}
          {state.result.mode === "rule" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-on-dark-panel px-2.5 py-1.5">
              <span className="flex-1 t-caption leading-[1.5] text-ai-muted">
                AI 모델이 일시적으로 응답하지 않아 규칙 기반으로 요약했어요.
              </span>
              <button
                type="button"
                onClick={() => run(true)}
                className="press inline-flex min-h-10 shrink-0 items-center rounded-lg border border-on-dark-faint px-3 t-caption font-bold text-ai-accent"
              >
                다시 시도
              </button>
            </div>
          )}
          {state.result.marketSummary && (
            <div className="rounded-lg bg-on-dark-panel px-2.5 py-1.5 t-caption font-bold text-ai-accent">
              실시세 {state.result.marketSummary}
            </div>
          )}
          {state.result.strengths.length > 0 && (
            <div>
              <div className="t-caption font-bold text-ai-accent">강점</div>
              {state.result.strengths.map((b) => (
                <div key={b} className="text-[12px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.risks.length > 0 && (
            <div>
              <div className="t-caption font-bold text-ai-danger">약점·리스크</div>
              {state.result.risks.map((b) => (
                <div key={b} className="text-[12px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.followUps.length > 0 && (
            <div>
              <div className="t-caption font-bold text-ai-muted">확인 필요</div>
              {state.result.followUps.map((b) => (
                <div key={b} className="text-[12px] leading-[1.55] text-ai-text">
                  · {b}
                </div>
              ))}
            </div>
          )}
          {state.result.verdict && (
            <div className="border-t border-on-dark-panel pt-1.5 text-[12px] leading-[1.55] text-ai-text">
              <b className="text-on-dark">총평</b> — {state.result.verdict}
            </div>
          )}
          <div className="text-[10px] leading-[1.5] text-ai-muted">
            {state.result.disclaimer}.
          </div>
        </div>
      ) : state.kind === "login" ? (
        <div className="flex items-center justify-between gap-2">
          <span className="t-sub text-text-2">로그인하면 내 노트로 분석</span>
          <Link href="/login" className="tap-line shrink-0 t-sub font-bold text-primary">
            로그인 ›
          </Link>
        </div>
      ) : state.kind === "quota" ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-danger-soft px-3 py-2.5">
          <span className="t-sub font-bold text-danger">{state.message}</span>
          {state.upgrade && (
            <Link
              href="/subscription"
              className="self-start t-sub font-bold text-primary"
            >
              플랜 업그레이드하고 한도 늘리기 ›
            </Link>
          )}
        </div>
      ) : state.kind === "error" ? (
        <div className="rounded-lg bg-danger-soft px-3 py-2.5 t-sub font-bold text-danger">
          {state.message}
        </div>
      ) : null}

      {/* 게스트·노트 0편이면 단추를 세우지 않는다(위 한 줄이 할 일을 말한다) — 채움 파랑은 화면에 검색 하나 */}
      {canRun && (
        <button
          type="button"
          onClick={() => run(state.kind === "done")}
          disabled={state.kind === "running"}
          className="btn-outline btn-md w-full"
        >
          {state.kind === "running"
            ? "분석 중…"
            : state.kind === "done"
              ? "다시 분석하기"
              : "선택한 노트 분석하기"}
        </button>
      )}
    </div>
  );
}
