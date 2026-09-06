"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EmptyState, ErrorState } from "@/app/components/ui/EmptyState";
import { SkLine } from "@/app/components/ui/Skeleton";
import {
  formatVisitDate,
  recordsLoginHref,
  visitOrdinal,
  type ComplexRecordsResponse,
} from "@/lib/complex/my-records";

/* [967 · 15] 단지 허브 "내 기록" 탭 — 실데이터.
   예전엔 서버가 "아직 없어요"를 항상 그렸다(누가 보든). 이 페이지는 ISR 이라
   HTML 이 방문자 공용이므로, 개인 데이터는 탭이 열릴 때(=이 컴포넌트가 마운트될 때)
   클라이언트가 /api/me/complex-records 로 읽는다. 상태 넷을 다르게 말한다:
   불러오는 중 · 비로그인 · 0건 · N건. 조회 실패는 "없음"으로 그리지 않는다. */

type State =
  | { kind: "loading" }
  | { kind: "anon" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: ComplexRecordsResponse };

export function MyRecordsTab({
  complexId,
  altComplexId,
  complexName,
  noteHref,
}: {
  /** 순수 단지 id — 노트 metadata.complexId 와 같은 값 */
  complexId: string;
  /** 같은 단지의 다른 표기 id(대장 매칭 시 kapt.…, 허브의 v.id) — 있으면 함께 찾는다 */
  altComplexId?: string;
  complexName: string;
  /** /notes/new?apt=&region=&complexId=&lat=&lng= — 페이지의 다른 CTA 와 같은 주소 */
  noteHref: string;
}) {
  const pathname = usePathname();
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const qs = new URLSearchParams({ complexId });
      if (altComplexId && altComplexId !== complexId) qs.set("alt", altComplexId);
      const res = await fetch(`/api/me/complex-records?${qs.toString()}`, {
        signal,
        credentials: "same-origin",
      });
      if (res.status === 401) {
        setState({ kind: "anon" });
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setState({ kind: "error", message: j.error ?? "지금은 내 기록을 불러올 수 없어요" });
        return;
      }
      const data = (await res.json()) as ComplexRecordsResponse;
      setState({ kind: "ok", data });
    } catch {
      /* 탭을 떠나며 취소된 요청은 오류가 아니다 */
      if (signal?.aborted) return;
      setState({ kind: "error", message: "네트워크 오류가 발생했어요" });
    }
  }, [complexId, altComplexId]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  if (state.kind === "loading") {
    return (
      <div className="flex flex-col gap-2.5" role="status" aria-label="내 기록 불러오는 중">
        {/* 카드 두 장 모양 — 실제 목록과 같은 자리를 먼저 잡는다 */}
        {[0, 1].map((i) => (
          <div key={i} className="card flex flex-col gap-2 rounded-[14px] px-3.5 py-3">
            <SkLine w="58%" h={14} />
            <SkLine w="36%" h={10} />
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === "anon") {
    const search = typeof window !== "undefined" ? window.location.search : "";
    return (
      <EmptyState
        title="로그인하면 이 단지에 남긴 임장노트가 여기에 모여요"
        desc="방문 회차·점수·판정이 단지별로 쌓이고, 관심 단지로 저장하면 시세 변동 알림도 받아요"
        action={{ label: "로그인", href: recordsLoginHref(pathname ?? "", search) }}
      />
    );
  }

  if (state.kind === "error") {
    return (
      <ErrorState
        desc={state.message}
        onRetry={() => void load()}
      />
    );
  }

  const { notes, watching } = state.data;

  if (notes.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        <EmptyState
          title="아직 이 단지 임장노트가 없어요"
          desc="직접 방문해 기록하면 회차별 점수·판정이 여기에 쌓여요"
          action={{ label: `${complexName} 임장노트 쓰기`, href: noteHref }}
        />
        {watching === true && (
          <p className="px-1 t-caption text-text-3" role="status">
            관심 단지로 저장돼 있어요 · 시세가 움직이면 알림을 보내요
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-xs font-extrabold text-text-3">
          내 임장노트 {notes.length}건
          {watching === true && <span className="ml-1.5 font-medium">· 관심 단지</span>}
        </span>
        <Link href="/notes" className="t-caption font-bold text-primary">
          내 노트 전체 ›
        </Link>
      </div>
      {notes.map((n, i) => (
        <Link
          key={n.id}
          href={`/notes/${encodeURIComponent(n.id)}`}
          className="card tile flex items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 no-underline"
        >
          <span className="min-w-0">
            <span className="block truncate t-body font-bold text-ink">{n.title || "제목 없는 노트"}</span>
            <span className="mt-0.5 block t-sub text-text-3">
              {visitOrdinal(i)} · {formatVisitDate(n.visitDate)}
              {!n.isPublic && " · 비공개"}
            </span>
          </span>
          <span className="shrink-0 text-right">
            {n.avgScore !== null ? (
              <>
                <span className="block t-section text-primary tabular-nums">{n.avgScore.toFixed(1)}</span>
                <span className="block t-caption text-text-3">평균 점수</span>
              </>
            ) : (
              <span className="t-caption text-text-3">점수 미입력</span>
            )}
          </span>
        </Link>
      ))}
      <Link href={noteHref} className="btn-primary btn-cta rounded-xl p-3 text-center t-body no-underline">
        {notes.length + 1}회차 임장노트 쓰기
      </Link>
    </div>
  );
}
