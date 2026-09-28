"use client";

/* [1021 · 지역 시세 gap] 전세가율·갭 스크리너 본문 — 시안(mock8/gap)대로.
   `lg:grid-cols-[280px_minmax(0,1fr)]`: 왼쪽 조건 패널(전세가율 이상 · 갭 이하 · 지역 · 월세 환산은 데이터에 있을 때만) + "내 예산으로" |
   오른쪽 타일 4칸(조건 맞는 곳 · 전세가율 중앙값 · 최고 · 최저 — 서버가 낸 값) + 결과 표(정렬 칩 3개 · 행마다 단지 보기) + 출처 줄.
   조건은 URL 쿼리에 남긴다 — 서버는 searchParams 를 읽지 않고(ISR 캐시 정책 유지) 전체 목록을 내려 주며,
   여기서 history.replaceState 로만 반영하고 필터·정렬·예산은 클라이언트 계산(screener-model). 폰: 조건 패널이 위(접이식), 표는 가로 스크롤. */
import { useEffect, useMemo, useState } from "react";
import { Explain } from "@/app/components/explain/Explain";
import { formatKrwShort } from "@/lib/market/format";
import { RankTable, type Row } from "./RankTable";
import {
  EMPTY_FILTER,
  GAP_OPTIONS,
  RATIO_OPTIONS,
  YIELD_OPTIONS,
  applyFilter,
  budgetSummary,
  effectiveGap,
  parseBudget,
  parseFilter,
  parseSort,
  serializeFilter,
  sidoOptions,
  sortRows,
  type GapFilter,
  type SortKey,
} from "./screener-model";

const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: "ratio", label: "전세가율" },
  { key: "gap", label: "갭 작은 순" },
  { key: "index", label: "지수 오른 순" },
];

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : undefined }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function conditionLine(f: GapFilter): string {
  const parts: string[] = [];
  if (f.minRatio !== null) parts.push(`전세가율 ${f.minRatio}%+`);
  if (f.maxGapMan !== null) parts.push(`갭 ${formatKrwShort(f.maxGapMan * 10_000)}↓`);
  if (f.sido) parts.push(f.sido);
  if (f.minYield !== null) parts.push(`월세 환산 ${f.minYield}%+`);
  return parts.length > 0 ? parts.join(" · ") : "조건 없음";
}

const SELECT_CLS = "gap-inp";

export function GapScreener({
  rows,
  median,
  yieldFailed,
}: {
  /** 전세가율 높은 순으로 정렬된 전체 목록(서버) */
  rows: Row[];
  /** 전세가율 중앙값(서버 계산) */
  median: number | null;
  yieldFailed: boolean;
}) {
  const [filter, setFilter] = useState<GapFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<SortKey>("ratio");
  const [budget, setBudget] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  /* 주소 → 상태(첫 마운트). 그 뒤 상태 → 주소(replaceState — 서버 렌더는 건드리지 않는다) */
  useEffect(() => {
    const s = window.location.search;
    setFilter(parseFilter(s));
    setSort(parseSort(s));
    setBudget(parseBudget(s));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const q = serializeFilter(filter, { sort, budgetMan: budget });
    const next = `${window.location.pathname}${q}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [ready, filter, sort, budget]);

  const sidos = useMemo(() => sidoOptions(rows), [rows]);
  const showYield = yieldFailed || rows.some((r) => r.rentYield !== undefined);
  const filtered = useMemo(() => sortRows(applyFilter(rows, filter), sort), [rows, filter, sort]);
  const maxRatio = rows[0]?.ratio ?? 0;
  const top = rows[0] ?? null;
  const bottom = rows.length > 0 ? rows[rows.length - 1] : null;
  const mine = useMemo(() => budgetSummary(rows, budget), [rows, budget]);
  const hasCondition = filter.minRatio !== null || filter.maxGapMan !== null || filter.sido !== null || filter.minYield !== null;

  const panel = (
    <>
      <div className="card rounded-2xl p-3.5">
        <div className="t-sub font-bold text-text-3">조건</div>
        <label className={SELECT_CLS}>
          <span>전세가율</span>
          <select
            value={filter.minRatio ?? ""}
            onChange={(e) => setFilter({ ...filter, minRatio: e.target.value ? Number(e.target.value) : null })}
            aria-label="전세가율 이상"
          >
            <option value="">제한 없음</option>
            {RATIO_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v}% 이상
              </option>
            ))}
          </select>
        </label>
        <label className={SELECT_CLS}>
          <span>갭(매매 − 전세)</span>
          <select
            value={filter.maxGapMan ?? ""}
            onChange={(e) => setFilter({ ...filter, maxGapMan: e.target.value ? Number(e.target.value) : null })}
            aria-label="갭 이하"
          >
            <option value="">제한 없음</option>
            {GAP_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {formatKrwShort(v * 10_000)} 이하
              </option>
            ))}
          </select>
        </label>
        {sidos.length > 1 && (
          <label className={SELECT_CLS}>
            <span>지역</span>
            <select
              value={filter.sido ?? ""}
              onChange={(e) => setFilter({ ...filter, sido: e.target.value || null })}
              aria-label="지역"
            >
              <option value="">전국</option>
              {sidos.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
        {showYield && !yieldFailed && (
          <label className={SELECT_CLS}>
            <span>월세 환산</span>
            <select
              value={filter.minYield ?? ""}
              onChange={(e) => setFilter({ ...filter, minYield: e.target.value ? Number(e.target.value) : null })}
              aria-label="월세 환산 수익률 이상"
            >
              <option value="">제한 없음</option>
              {YIELD_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  연 {v}% 이상
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="t-body flex-1 font-bold text-ink" aria-live="polite">
            {filtered.length}곳
            <span className="t-sub font-medium text-text-3"> / {rows.length}</span>
          </span>
          <button
            type="button"
            onClick={() => setFilter(EMPTY_FILTER)}
            disabled={!hasCondition}
            className="btn-soft btn-sm min-h-10"
          >
            초기화
          </button>
        </div>
        <p className="mt-2 t-sub text-text-3">조건은 주소에 남는다</p>
      </div>

      <div className="card rounded-2xl p-3.5">
        <div className="t-sub font-bold text-text-3">내 예산으로</div>
        <label className={SELECT_CLS}>
          <span>가진 돈</span>
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={500}
              value={budget ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                setBudget(e.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : n);
              }}
              aria-label="가진 돈(만원)"
              placeholder="0"
              className="w-24 text-right"
            />
            <span className="text-text-3">만원</span>
          </span>
        </label>
        {mine && (
          <p className="mt-2 t-sub text-ink">
            갭이 <b>{formatKrwShort((budget ?? 0) * 10_000)} 이하</b>인 지역 <b>{mine.count}곳</b>
            {mine.avgSale !== null && <> · 평균 매매가 {formatKrwShort(mine.avgSale)}</>}
          </p>
        )}
      </div>
    </>
  );

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
      {/* 조건 패널 — 폰은 위(접이식), lg 는 왼쪽 고정 */}
      <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="gap-panel"
          className="card flex min-h-10 items-center justify-between rounded-2xl px-3.5 py-2 text-left lg:hidden"
        >
          <span className="t-sub font-bold text-ink">
            조건 · {filtered.length}곳
            <span className="ml-1 font-medium text-text-3">{conditionLine(filter)}</span>
          </span>
          <span className="text-text-3">
            <Chevron open={open} />
          </span>
        </button>
        <div id="gap-panel" className={`${open ? "flex" : "hidden"} flex-col gap-3 lg:flex`}>
          {panel}
        </div>
      </aside>

      <main className="min-w-0">
        {/* 타일 4칸 — 서버가 낸 값(중앙값·최고·최저) + 조건에 맞는 곳 */}
        <div className="gap-tiles">
          <div className="kpi">
            <span className="kpi-k">조건에 맞는 곳</span>
            <span className="kpi-v">
              {filtered.length}곳 <span className="t-sub font-medium text-text-3">/ {rows.length}</span>
            </span>
            <span className="kpi-d truncate">{conditionLine(filter)}</span>
          </div>
          {median !== null && (
            <div className="kpi">
              <span className="kpi-k inline-flex items-center gap-0.5">
                전세가율 중앙값
                <Explain
                  term="jeonse-garyul"
                  how="공표 지역 통계(한국부동산원·KB)의 매매가 대비 전세가 비율. 집계 지역을 줄 세운 가운데 값."
                  size={12}
                />
              </span>
              <span className="kpi-v">{median.toFixed(1)}%</span>
              <span className="kpi-d">전체 {rows.length}곳</span>
            </div>
          )}
          {top && (
            <div className="kpi">
              <span className="kpi-k">가장 높은 곳</span>
              <span className="kpi-v truncate">
                {top.name} {top.ratio.toFixed(1)}%
              </span>
              <span className="kpi-d">{effectiveGap(top) !== null ? `갭 ${formatKrwShort(effectiveGap(top))}` : "갭이 가장 작다"}</span>
            </div>
          )}
          {bottom && (
            <div className="kpi">
              <span className="kpi-k">가장 낮은 곳</span>
              <span className="kpi-v truncate">
                {bottom.name} {bottom.ratio.toFixed(1)}%
              </span>
              <span className="kpi-d">{effectiveGap(bottom) !== null ? `갭 ${formatKrwShort(effectiveGap(bottom))}` : "갭이 가장 크다"}</span>
            </div>
          )}
        </div>

        {/* 결과 표 */}
        <section className="card mt-3 rounded-2xl p-4" data-reveal="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-section text-ink">
              결과 {filtered.length}곳 · {SORTS.find((s) => s.key === sort)?.label} 순
            </h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="정렬">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSort(s.key)}
                  aria-pressed={sort === s.key}
                  className={`chip press min-h-10 border px-3 py-1.5 t-sub ${
                    sort === s.key ? "chip-active" : "border-line bg-surface text-text-2"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2">
            {filtered.length === 0 ? (
              <p className="t-sub py-8 text-center text-text-3">조건에 맞는 지역 없음</p>
            ) : (
              <RankTable rows={filtered} maxRatio={maxRatio} yieldFailed={yieldFailed} showYield={showYield} />
            )}
          </div>
          <p className="mt-2 t-sub text-text-3">갭이 작은 지역은 역전세·매매가·전세가 역전 위험도 함께 큼 · 안전하다는 뜻 아님</p>
        </section>
      </main>
    </div>
  );
}
