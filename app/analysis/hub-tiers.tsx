"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ToolGlyph } from "./ToolGlyph";
import type { WorkbenchCardDto } from "./workbench-cards";
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

export function WorkbenchGrid({ core, more }: { core: WorkbenchCardDto[]; more: WorkbenchCardDto[] }) {
  const [expanded, setExpanded] = useState(false);
  const { picked, query, openMap } = useHubPicked();
  const router = useRouter();

  /* [980] 카드 내용은 서버가 조립해 준다(app/analysis/workbench-cards.ts).
     여기서 tool-identity·tool-persona 를 직접 import 하면 두 모듈이 통째로
     브라우저 번들에 실려 /analysis 예산(490KB)을 넘긴다 — 실측 502KB. */
  const cards = expanded ? [...core, ...more] : core;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cards.map((c) => {
          const id = c.id;
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
              className="tile card tool-scope tool-rail flex flex-col gap-1.5 rounded-[14px] p-3.5 no-underline"
              style={c.vars}
              data-tool={id}
            >
              {/* [980] 12칸이 전부 같은 파란 칩이었다 — tier.iconClass 하나를 공유했고,
                  lib/ai/tool-identity.ts 도 12종 중 10종이 같은 액센트(#3182f6)였다.
                  이제 칩 색·왼쪽 띠·성격 라벨이 도구마다 다르다. 색은 카드 래퍼에
                  CSS 변수로 한 번만 꽂는다(personaVars). */}
              <span className="tool-soft-bg tool-ink tile-ico flex h-12 w-12 items-center justify-center rounded-[10px]">
                <ToolGlyph id={c.glyph} size={34} />
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="t-section text-ink">{c.title}</span>
                <span className="tool-soft-bg tool-ink rounded px-1.5 py-px t-caption font-extrabold">
                  {c.character}
                </span>
              </span>
              {/* 설명은 기능 한 줄(tagline)이 아니라 **이 화면이 하는 일**로 바꿨다 */}
              <span className="t-sub text-text-2">{c.premise}</span>
              {c.result && (
                <span className="t-caption mt-auto inline-flex items-center gap-1 text-text-3">
                  <span className="tool-ink h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                  결과: {c.result}
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
          {expanded ? "자주 쓰는 4개만 보기" : `나머지 ${more.length}개 더 보기`}
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
