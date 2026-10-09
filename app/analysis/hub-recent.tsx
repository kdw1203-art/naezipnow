"use client";
/* [1023 · AI 분석] 허브 "최근 실행 결과" — lib/ai/history-store(이 기기 localStorage)에 ResultView 가 남긴 실행 기록을
   마운트 뒤 읽어 최신 3건을 한 줄 카드로 보인다(서버 HTML 은 비어 있다 — 사용자별 값이 ISR 한 벌에 실리지 않게).
   저장된 것만 보인다: 도구 · 결과 첫 문장(headline) · 점수(있을 때) · N일 전. 새 계산·이름 조회 없음.
   링크는 결과 페이지 — 단지 id 로 저장한 도구(종합 진단)는 ?complexId= 를 실어 같은 단지로 다시 연다.
   지역 이름으로 저장한 매수 타이밍은 도구 화면만(딥링크는 단지+지역이 함께 있어야 열린다). 기록이 없으면 카드도 없다. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { daysSinceRun, listRecentHistory, type HistoryEntry } from "@/lib/ai/history-store";

/** 지역 이름을 키로 저장하는 도구 — ResultView historyKey 규칙과 같다 */
const REGION_KEYED = new Set(["ai-timing"]);

export function recentRunHref(e: Pick<HistoryEntry, "tool" | "groupKey">): string {
  const base = `/analysis/ai/${encodeURIComponent(e.tool)}`;
  if (REGION_KEYED.has(e.tool) || !e.groupKey || e.groupKey === e.tool) return base;
  return `${base}?complexId=${encodeURIComponent(e.groupKey)}`;
}

export function recentRunWhen(createdAt: string, now?: number): string | null {
  const d = daysSinceRun(createdAt, now);
  if (d === null) return null;
  return d === 0 ? "오늘" : `${d}일 전`;
}

/* [1050 · 번들] 도구 이름은 서버가 넘긴다(titles) — 예전엔 tool-catalog workbenchCard → tool-identity(12종 설명 · 아이콘)가
   통째로 /analysis 브라우저 번들에 실렸다(약 14KB). 모르는 도구 id 는 id 그대로(예전과 같다). */
export function HubRecentRuns({ limit = 3, titles = {} }: { limit?: number; titles?: Readonly<Record<string, string>> }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    try {
      setItems(listRecentHistory(limit));
    } catch {
      setItems([]);
    }
  }, [limit]);
  if (items.length === 0) return null;
  return (
    <div className="card flex flex-col gap-1 rounded-2xl px-3.5 py-2.5">
      <span className="t-caption font-bold text-text-3">최근 실행 결과</span>
      <ul className="m-0 flex list-none flex-col p-0" data-tone="plain">
        {items.map((e) => {
          const when = recentRunWhen(e.createdAt);
          return (
            <li key={`${e.tool}::${e.groupKey}`}>
              <Link
                href={recentRunHref(e)}
                className="flex min-h-10 items-center gap-2 no-underline"
              >
                <span className="t-sub shrink-0 font-bold text-ink">{titles[e.tool] ?? e.tool}</span>
                <span className="t-sub min-w-0 flex-1 truncate text-text-2">
                  {e.headline ?? e.groupKey}
                </span>
                {e.score != null && (
                  <span className="t-sub t-num shrink-0 text-ink">{e.score}점</span>
                )}
                {when && <span className="t-caption shrink-0 text-text-3">{when}</span>}
                <span className="t-sub shrink-0 font-bold text-primary" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
