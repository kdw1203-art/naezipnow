"use client";

import {
  DECISION_FILTER_LABEL,
  MINE_PERIOD_OPTIONS,
  MINE_SORT_OPTIONS,
  hasActiveMineFilter,
  type MineFilterOptions,
  type MineFilters,
} from "@/lib/notes/mine-filters";

/* [1006] 내 노트 뷰의 필터 줄 — 정렬(최신·방문일·점수) · 판단 · 지역 · 기간(방문일).
   판단·지역 칩은 노트에 실제로 있는 값만(lib/notes/mine-filters.mineFilterOptions) —
   눌러도 0건인 칩은 그리지 않는다. 각 줄은 가로 스크롤(390px 에서 넘치지 않게).
   칩은 40px(chip + py-2 + t-sub) — 989 터치 규칙. 상태·규칙은 부모(NotesFeedClient)와
   순수 모듈이 들고, 여기는 그리기만 한다. */

const CHIP_ON = "chip press shrink-0 min-h-10 px-3.5 py-2 t-sub chip-active";
const CHIP_OFF = "chip press shrink-0 min-h-10 border border-line bg-surface px-3.5 py-2 t-sub text-text-2";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 t-caption font-bold text-text-3">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

export function MineFilterBar({
  value,
  options,
  total,
  shown,
  onChange,
  onReset,
}: {
  value: MineFilters;
  options: MineFilterOptions;
  /** 전체 노트 수 · 필터 뒤 노트 수 — "N건 중 M건" */
  total: number;
  shown: number;
  onChange: (next: MineFilters) => void;
  onReset: () => void;
}) {
  const active = hasActiveMineFilter(value);
  const set = (patch: Partial<MineFilters>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-2 px-1">
      <Row label="정렬">
        {MINE_SORT_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value.sort === o.value}
            onClick={() => set({ sort: o.value })}
            className={value.sort === o.value ? CHIP_ON : CHIP_OFF}
          >
            {o.label}
          </button>
        ))}
      </Row>
      {options.decisions.length > 0 && (
        <Row label="판단">
          <button
            type="button"
            aria-pressed={value.decision === null}
            onClick={() => set({ decision: null })}
            className={value.decision === null ? CHIP_ON : CHIP_OFF}
          >
            전체
          </button>
          {options.decisions.map((d) => (
            <button
              key={d.value}
              type="button"
              aria-pressed={value.decision === d.value}
              onClick={() => set({ decision: value.decision === d.value ? null : d.value })}
              className={value.decision === d.value ? CHIP_ON : CHIP_OFF}
            >
              {DECISION_FILTER_LABEL[d.value]}{" "}
              <span className="font-medium opacity-70">{d.count}</span>
            </button>
          ))}
        </Row>
      )}
      {options.regions.length > 0 && (
        <Row label="지역">
          <button
            type="button"
            aria-pressed={value.region === null}
            onClick={() => set({ region: null })}
            className={value.region === null ? CHIP_ON : CHIP_OFF}
          >
            전체
          </button>
          {options.regions.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={value.region === r.value}
              onClick={() => set({ region: value.region === r.value ? null : r.value })}
              className={value.region === r.value ? CHIP_ON : CHIP_OFF}
            >
              {r.value} <span className="font-medium opacity-70">{r.count}</span>
            </button>
          ))}
        </Row>
      )}
      <Row label="기간">
        {MINE_PERIOD_OPTIONS.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={value.period === o.value}
            onClick={() => set({ period: o.value })}
            className={value.period === o.value ? CHIP_ON : CHIP_OFF}
          >
            {o.label}
          </button>
        ))}
      </Row>
      <div className="flex min-h-6 items-center justify-between gap-2">
        <span role="status" className="t-caption text-text-3">
          {active ? `${total}건 중 ${shown}건` : `${total}건`}
          {value.period ? " · 방문일 기준" : ""}
        </span>
        {active && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-6 items-center t-caption font-bold text-primary"
          >
            필터 지우기
          </button>
        )}
      </div>
    </div>
  );
}
