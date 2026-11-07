"use client";

import { useState, type ReactNode } from "react";

/* [1108 · 단지 상세 A안] "이 단지 기록" — 사람이 쓴 글 세 자리(이 단지 임장노트 카드 · 거주민 후기 카드 · 단지 토론 섹션)를
   머리 하나 + 칩 줄 하나로 모은다. 1101~1107 에서 "같은 사실 두 곳"을 다섯 번 걷었는데도 사람 글이 세 머리로 흩어져 각각
   "없음"으로 비어 보였다(운영 실측 공작아파트 PC 4,888px · 노트 2 · 후기 0 · 토론 2). 한 자리에 모으면 빈 칸이 셋에서 하나로 준다.

   구조: 서버(page.tsx)가 각 칸의 내용을 노드로 넘긴다 — 임장노트 목록은 서버 HTML(색인 · 첫 화면), 후기 · 토론은 예전 그대로
   뷰포트 근처에서 받는 지연 조각(ComplexReviewsLazy · ComplexTalkLazy). 고른 칸만 마운트하므로 후기 · 토론 청크는 **그 칩을
   누른 뒤에만** 내려온다(예전엔 세 섹션이 스크롤만으로 전부 받았다 — /complex/[id] 첫 번들 상한 480KB 는 그대로, 전송은 준다).
   칩은 role=tab(←/→ 이동) · 기본 칸은 임장노트(있는 글이 첫 칸). 채움 파랑 없음 — 쓰기 단추는 outline(화면당 채움 1). */

export interface RecordPane {
  key: string;
  label: string;
  /** 건수를 아는 칸만(임장노트). 모르면 라벨만 */
  count?: number | null;
  node: ReactNode;
}

export function ComplexRecords({
  name,
  panes,
  initial,
  summary,
  action,
}: {
  name: string;
  panes: readonly RecordPane[];
  /** 처음 열 칸 key — 없으면 첫 칸 */
  initial?: string;
  /** 머리 오른쪽 한 줄("임장노트 2 · 토론 2") */
  summary?: string | null;
  /** 아래 행동 한 줄(outline 링크 등) — 칸과 무관하게 항상 */
  action?: ReactNode;
}) {
  const first = panes.find((p) => p.key === initial) ?? panes[0];
  const [active, setActive] = useState<string>(first?.key ?? "");
  if (panes.length === 0) return null;
  const cur = panes.find((p) => p.key === active) ?? panes[0];
  const idOf = (k: string) => `records-tab-${k}`;

  return (
    <section id="complex-records" aria-labelledby="complex-records-title" className="cv-auto rise-in-5 mt-6 scroll-mt-24 max-md:mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 px-1">
        <h2 id="complex-records-title" className="t-section text-ink">
          {name} 기록
        </h2>
        {summary ? <span className="t-caption text-text-3">{summary}</span> : null}
      </div>
      {/* 칩 줄 — 단지 탭(hub-client)과 같은 모양 · 선택은 네이비 채움 */}
      <div className="mb-2 flex flex-wrap gap-1.5 t-body" role="tablist" aria-label={`${name} 기록 종류`}>
        {panes.map((p, i) => {
          const on = p.key === cur.key;
          return (
            <button
              key={p.key}
              type="button"
              role="tab"
              id={idOf(p.key)}
              aria-selected={on}
              aria-controls="complex-records-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(p.key)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const next = panes[(i + (e.key === "ArrowRight" ? 1 : panes.length - 1)) % panes.length];
                setActive(next.key);
                document.getElementById(idOf(next.key))?.focus();
              }}
              className={`chip px-3.5 py-2 transition-colors ${on ? "bg-brand-navy font-bold! text-on-dark" : "border border-line bg-surface text-text-2"}`}
            >
              {p.label}
              {typeof p.count === "number" ? <span className="ml-1 tabular-nums opacity-80">{p.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div id="complex-records-panel" role="tabpanel" aria-labelledby={idOf(cur.key)}>
        {cur.node}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </section>
  );
}

export default ComplexRecords;
