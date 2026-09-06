"use client";

/* [OPT-47] 개인화 홈 카드 — 로그인 + 워치 단지에 최근 거래가 있을 때만 나타난다.
   홈 정적 캐시를 지키기 위한 클라이언트 섬: 없으면 아무것도 렌더하지 않는다
   (자리 확보용 스켈레톤도 없음 — 비로그인 다수에게 레이아웃 이동을 만들지 않기). */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSessionLite } from "@/lib/client/session-lite";

type Brief = {
  title: string;
  body: string;
  complexCount: number;
  tradeCount: number;
  /** [945 #47] 관심지역 브리핑이면 지역 상세로 — 없으면 워치리스트 기본 */
  href?: string;
  linkLabel?: string;
};

/* [967 · 27] 홈은 모바일·데스크톱 섹션이 둘 다 마운트되므로(CSS 로 한쪽만 보임) 이
   카드도 두 번 뜬다 — 요청은 한 번이면 된다. 같은 페이지 수명 안에서 공유하는
   짧은 캐시(getSessionLite 와 같은 방식). 실패는 캐시하지 않는다. */
const BRIEF_TTL_MS = 30_000;
let briefCache: { at: number; promise: Promise<{ ok?: boolean; brief?: Brief | null } | null> } | null = null;
function fetchHomeBrief() {
  if (briefCache && Date.now() - briefCache.at < BRIEF_TTL_MS) return briefCache.promise;
  const promise = fetch("/api/me/home-brief", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; brief?: Brief | null }>) : null))
    .catch(() => null)
    .then((j) => {
      if (j === null && briefCache?.promise === promise) briefCache = null;
      return j;
    });
  briefCache = { at: Date.now(), promise };
  return promise;
}

export function HomeWatchlistBrief({
  onResolved,
}: {
  /** [967 · 27] 조회가 끝나면 "그릴 것이 있는가"를 알린다 — 홈 "내 관심" 레일이
      두 자식(관심단지 변동·최근 본 단지)이 모두 비었을 때 레일째 숨기기 위해. */
  onResolved?: (hasContent: boolean) => void;
} = {}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  /* 콜백은 ref 로 들고 있는다 — 부모가 매 렌더 새 함수를 줘도 조회를 다시 하지 않게 */
  const onResolvedRef = useRef(onResolved);
  onResolvedRef.current = onResolved;
  useEffect(() => {
    let alive = true;
    /* [2026-08-28] 로그인 여부를 먼저 본다. 예전에는 마운트 즉시 쏴서
       비로그인 방문자마다 401 이 돌아왔고, 크롬 콘솔에 빨간 줄이 남았다.
       세션 조회는 홈이 어차피 하고 있고 모듈 캐시를 공유한다(요청 증가 없음). */
    void getSessionLite()
      .then((s) => {
        if (!alive || !s?.user?.email) return null;
        return fetchHomeBrief();
      })
      .then((j: { ok?: boolean; brief?: Brief | null } | null) => {
        if (!alive) return;
        const has = Boolean(j?.ok && j?.brief);
        if (has) setBrief(j!.brief!);
        onResolvedRef.current?.(has);
      })
      .catch(() => {
        if (alive) onResolvedRef.current?.(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!brief) return null;
  return (
    <section
      aria-label="내 관심 단지 최근 거래"
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-bold text-ink">{brief.title}</h2>
        <Link
          href={brief.href ?? "/my/watchlist"}
          className="shrink-0 text-xs font-semibold text-primary"
        >
          {brief.linkLabel ?? "워치리스트 ›"}
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-text-2">{brief.body}</p>
      <p className="mt-1 text-[12px] text-text-3">
        {brief.complexCount > 0
          ? `관심 단지 ${brief.complexCount}곳 · 최근 7일 신규 신고 ${brief.tradeCount}건 · 국토부 실거래 기준`
          : "관심지역 요약 · 국토부 실거래·공표 지수 기준"}
      </p>
    </section>
  );
}
