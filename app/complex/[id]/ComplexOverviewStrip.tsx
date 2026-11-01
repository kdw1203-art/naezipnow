/* [1024 · 단지 상세] 개요 스트립 8칸(세대·동·준공·주차/세대·승강기·난방·건설사·관리) — K-apt 값. 시안 mock1024/complex-d.
   서버 조각(JS 없음). 칸은 고정 8개, 값이 없으면 "—"(overviewStripCells). 폰 4×2 · md 이상 8×1 — 칸 사이 선은
   globals.css `.cx-strip`(nth-child 규칙은 유틸로 못 적는다).
   [1095 · 구성] K-apt 대장에 안 맞는 단지(매매 실거래 단지 34,314곳 중 세대수 없는 곳 15,918 · 46%)는 8칸 중 7칸이 "—" 였다 — 첫 화면이
   빈 칸 일곱 개로 시작했다(운영 실측 개포더샵트리에: 준공만). 아는 값이 2개 이하면 격자 대신 **아는 것만 한 줄**(사실 낱말 · "—" 없음),
   0개면 아무것도 그리지 않는다. 3개 이상이면 전처럼 8칸(빈 칸이 소수라 격자가 읽힌다). */
import { OVERVIEW_EMPTY, overviewStripCells, type OverviewStripSource } from "./complex-v2-model";

/** 이 수 이하로 아는 값이면 한 줄로 */
export const OVERVIEW_COMPACT_MAX = 2;

export function ComplexOverviewStrip({ row, nowYear }: { row: OverviewStripSource; /** [1028] 한국 시간의 올해 — 준공 칸에 입주 연차를 적는다 */ nowYear?: number }) {
  const cells = overviewStripCells(row, { nowYear });
  const known = cells.filter((c) => c.value !== OVERVIEW_EMPTY);
  if (known.length === 0) return null;
  if (known.length <= OVERVIEW_COMPACT_MAX) {
    return (
      <dl className="card rise-in-1 mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-2xl px-4 py-2.5" aria-label="단지 개요">
        {known.map((c) => (
          <div key={c.key} className="flex min-w-0 items-baseline gap-1.5">
            <dt className="t-caption text-text-3">
              {c.label}
              {c.note ? <span className="tabular-nums"> · {c.note}</span> : null}
            </dt>
            <dd className="m-0 t-body font-bold text-ink tabular-nums">{c.value.replace(/,(?=\S)/g, ", ")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="cx-strip card rise-in-1 mt-3 grid grid-cols-4 rounded-2xl md:grid-cols-8" aria-label="단지 개요">
      {cells.map((c) => (
        <div key={c.key} className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
          <dt className="t-caption text-text-3">
            {c.label}
            {c.note ? <span className="tabular-nums"> · {c.note}</span> : null}
          </dt>
          {/* [1084] 글자 값(건설사 "현대건설,삼성물…" · 난방)은 두 줄까지 — 한 줄 말줄임이라 두 번째 회사를 읽을 수 없었다(운영 실측).
              숫자 칸은 한 줄 그대로. 잘리면 title 로 전체 */}
          <dd
            className={`m-0 t-section text-ink ${c.num ? "truncate tabular-nums" : "line-clamp-2 break-words"}`}
            title={typeof c.value === "string" ? c.value : undefined}
          >
            {typeof c.value === "string" ? c.value.replace(/,(?=\S)/g, ", ") : c.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default ComplexOverviewStrip;
