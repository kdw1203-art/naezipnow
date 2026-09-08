"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToolGlyph, WORKBENCH_GLYPH } from "./ToolGlyph";
import {
  TIERS,
  WORKBENCH_CORE,
  WORKBENCH_MORE,
  workbenchCard,
} from "./tool-catalog";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { useHubPicked } from "./hub-context";

/* ============================================================
   워크벤치 그리드 — [UI-03 · UI-06 · UI-08 · UI-10 · 958]

   예전: 12장이 한꺼번에 펼쳐졌고 전부 같은 문장을 달고 있었다. 지금: 자주
   쓰는 4종만 펼치고 8종은 접는다. 958 에서 카드마다 **결과물 모양 글리프**와
   "무엇이 나오는지"(metricLabel) 한 줄을 붙였다 — 이름만으로는 열두 도구가
   서로 뭐가 다른지 알 수 없었다.

   [975] **카드를 누르면 지도가 함께 뜬다.** 예전엔 단지를 안 고른 채 카드를
   누르면 빈 도구 화면이 열렸고, 거기서 단지명을 정확히 알아야 시작할 수 있었다.
   이제 고른 단지가 없으면 카드 클릭이 지도 서랍을 열고(검색도 그 안에 있다),
   거기서 고른 단지로 **그 도구를** 곧장 연다. 새 탭/가운데 클릭 같은 수식 클릭은
   가로채지 않고, 서랍 안에 "단지 없이 먼저 보기" 길도 남긴다.
   ============================================================ */

export function WorkbenchGrid() {
  const [expanded, setExpanded] = useState(false);
  const { picked, query, openMap } = useHubPicked();
  const router = useRouter();
  const tier = TIERS.complex;

  const ids = expanded ? [...WORKBENCH_CORE, ...WORKBENCH_MORE] : WORKBENCH_CORE;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {ids.map((id) => {
          const c = workbenchCard(id);
          const idn = TOOL_IDENTITIES[id];
          const result = idn.metricLabel && idn.metricLabel !== "결과"
            ? `${idn.metricLabel}${idn.metricUnit ? `(${idn.metricUnit})` : ""}`
            : null;
          return (
            <Link
              key={id}
              href={`${c.href}${query}`}
              onClick={(e) => {
                /* 단지가 이미 있으면 그대로 간다. 새 탭·가운데 클릭도 건드리지 않는다. */
                if (picked) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                openMap({
                  purpose: c.title,
                  skipHref: c.href,
                  onPicked: (p) =>
                    router.push(`${c.href}?complexId=${encodeURIComponent(p.id)}`),
                });
              }}
              className="tile card flex flex-col gap-1.5 rounded-[14px] p-3.5 no-underline"
            >
              <span
                className={`tile-ico flex h-12 w-12 items-center justify-center rounded-[10px] ${tier.iconClass}`}
              >
                <ToolGlyph id={WORKBENCH_GLYPH[id] ?? "radar"} size={34} />
              </span>
              <span className="t-section text-ink">{c.title}</span>
              <span className="t-sub text-text-2">{c.desc}</span>
              {result && (
                <span className="t-caption mt-auto inline-flex items-center gap-1 text-text-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-red" aria-hidden="true" />
                  결과: {result}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="chip t-sub inline-flex items-center gap-1.5 border border-line bg-surface px-3.5 py-2 font-bold text-text-2 transition-colors hover:text-primary"
        >
          {expanded ? "자주 쓰는 4개만 보기" : `나머지 ${WORKBENCH_MORE.length}개 더 보기`}
          <span className={expanded ? "rotate-180" : ""} aria-hidden="true">
            ▾
          </span>
        </button>
        {picked ? (
          <span className="t-sub text-text-3">
            <span className="font-bold text-primary">{picked.name}</span> 기준으로 열려요
          </span>
        ) : (
          <span className="t-sub text-text-3">
            카드를 누르면 지도가 떠요 — 지도나 검색으로 단지를 고르면 그 도구가 바로 열립니다
          </span>
        )}
      </div>
    </div>
  );
}
