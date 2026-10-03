"use client";

/* [1026 · 지역 시세] 1025 표준 — 절차 한 줄(조건 · {조건} → 결과 · N곳 → 단지 → 다음 행동) · 결론 한 줄(t-title "조건에 맞는 107곳 ·
   전세가율 중앙 66.2% · 최고 광주 북구 81.4%" + 판정 칩: 결과 최고가 80% 이상이면 "80% 이상 있음"(주의) · 근거 = 최고 지역 평균 매매·갭).
   조건을 바꾸면 결론·절차가 바로 바뀐다(같은 applyFilter). 데스크톱: 본문(결론 · 숫자 칸 · 결과 표) | 레일 340(조건 · 내 예산 · 다음 행동 카드).
   폰: 결론 바로 아래 접이식 조건(손잡이) → 숫자 2칸(가장 높은·낮은 곳) → 결과는 **카드 목록**(RankCards · 20장 + 더 보기 — 10열 표는 md+ 만)
   → 다음 행동 카드(텍스트 링크) · 채움 파랑 "이 지역 알림 받기"는 하단 바(MobilePrimaryBar). "이 지역" = 결과의 전세가율 최고 지역.
   문장은 lib/market/region-conclusion(새 계산 없음 · 중앙값은 서버가 낸 전체 값 그대로). 채움 파랑 리터럴은 여기 없다(region-verdict 한 곳).
   [1021 · 지역 시세 gap] 전세가율·갭 스크리너 본문 — 시안(mock8/gap)대로.
   (당시 280px 왼쪽 열 — [1026] 오른쪽 레일 340 으로 옮김) 조건 패널(전세가율 이상 · 갭 이하 · 지역 · 월세 환산은 데이터에 있을 때만) + "내 예산으로" |
   오른쪽 타일 4칸(조건 맞는 곳 · 전세가율 중앙값 · 최고 · 최저 — 서버가 낸 값) + 결과 표(정렬 칩 3개 · 행마다 단지 보기) + 출처 줄.
   조건은 URL 쿼리에 남긴다 — 서버는 searchParams 를 읽지 않고(ISR 캐시 정책 유지) 전체 목록을 내려 주며,
   여기서 history.replaceState 로만 반영하고 필터·정렬·예산은 클라이언트 계산(screener-model). 폰: 조건 패널이 위(접이식), 표는 가로 스크롤. */
import { useEffect, useMemo, useState } from "react";
import { Explain } from "@/app/components/explain/Explain";
import { StepLine } from "@/app/components/StepLine";
import { formatKrwShort } from "@/lib/market/format";
import { GAP_CARD_PAGE, gapConclusion, gapSteps, nextCardCount, regionActionLinks } from "@/lib/market/region-conclusion";
import { RegionActionCard, RegionPrimaryBar, VerdictCard } from "../timing/region-verdict";
import { RankTable, type Row } from "./RankTable";
import { RankCards } from "./RankCards";
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

/* [1027] 행의 group 이 시/도 이름인가("그 밖의 지역"이면 붙이지 않는다) — lib/market/sido-group 을 이 클라이언트 묶음에 싣지 않으려 글자로 본다 */
const SIDO_NAME_RE = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)$/;

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
  /* [1026] 조건만 건 목록(서버가 전세가율 높은 순으로 내려 준 순서 그대로) — 첫 행 = 결과의 최고 전세가율 */
  const matched = useMemo(() => applyFilter(rows, filter), [rows, filter]);
  const filtered = useMemo(() => sortRows(matched, sort), [matched, sort]);
  const maxRatio = rows[0]?.ratio ?? 0;
  const top = rows[0] ?? null;
  const bottom = rows.length > 0 ? rows[rows.length - 1] : null;
  const mine = useMemo(() => budgetSummary(rows, budget), [rows, budget]);
  const hasCondition = filter.minRatio !== null || filter.maxGapMan !== null || filter.sido !== null || filter.minYield !== null;

  /* [1026] 폰 카드 목록 — 20장씩. 조건·정렬이 바뀌면 처음 20장으로 */
  const [shown, setShown] = useState(GAP_CARD_PAGE);
  useEffect(() => {
    setShown(GAP_CARD_PAGE);
  }, [filter, sort]);

  /* [1026] 절차 · 결론 · 다음 행동 — 화면이 가진 값(걸러진 곳 수 · 서버 중앙값 · 결과 첫 행)만 */
  const lead = matched[0] ?? null;
  const plan = gapSteps(hasCondition ? conditionLine(filter) : null, filtered.length);
  const conclusion = gapConclusion({
    count: filtered.length,
    hasCondition,
    median,
    top: lead
      ? { name: lead.name, ratio: lead.ratio, avgSale: lead.avgSale, gap: effectiveGap(lead), measured: lead.measuredGap !== undefined }
      : null,
  });
  /* [1027] 알림 구독은 시/도를 붙인 이름으로 — 이 표의 이름은 카탈로그 표기라 "중구"가 서울 중구다.
     시/도를 붙여 보내면 다른 시의 중구로 읽힐 여지가 없고, 버튼에도 어느 지역인지 그대로 적힌다. */
  const leadRegion = lead ? (SIDO_NAME_RE.test(lead.group) && !lead.name.startsWith(`${lead.group} `) ? `${lead.group} ${lead.name}` : lead.name) : null;
  const actionCard = (
    <RegionActionCard regionLabel={leadRegion} links={regionActionLinks(lead?.name ?? null, lead?.name ?? null)} />
  );

  const panel = (
    <>
      <section className="card rounded-2xl p-4 max-md:p-3.5">
        <h2 className="t-section text-ink">조건</h2>
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
      </section>

      <section className="card rounded-2xl p-4 max-md:p-3.5">
        <h2 className="t-section text-ink">내 예산으로</h2>
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
      </section>
    </>
  );

  return (
    <>
      {/* [1026] 절차 한 줄 — 화면당 한 번 */}
      <StepLine steps={plan.steps} current={plan.current} />

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          {/* [1026] 결론 한 줄 — 조건을 바꾸면 바로 바뀐다 */}
          <VerdictCard conclusion={conclusion} />

          {/* 손잡이(폰) — 결론 바로 아래 접이식 조건. lg 는 오른쪽 레일 */}
          <div className="lg:hidden">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="gap-panel"
              className="card flex min-h-10 w-full items-center justify-between rounded-2xl px-3.5 py-2 text-left"
            >
              <span className="t-sub font-bold text-ink">
                조건 · {filtered.length}곳
                <span className="ml-1 font-medium text-text-3">{conditionLine(filter)}</span>
              </span>
              <span className="text-text-3">
                <Chevron open={open} />
              </span>
            </button>
            <div id="gap-panel" className={open ? "mt-3 flex flex-col gap-3" : "hidden"}>
              {panel}
            </div>
          </div>

          {/* 숫자 칸 4개 — 서버가 낸 값(중앙값·최고·최저) + 조건에 맞는 곳. [1026] 폰은 결론과 겹치는 앞 두 칸을 숨긴다 */}
          <div className="gap-tiles">
            <div className="min-w-0 max-md:hidden">
              <div className="kpi h-full">
                <span className="kpi-k">조건에 맞는 곳</span>
                <span className="kpi-v">
                  {filtered.length}곳 <span className="t-sub font-medium text-text-3">/ {rows.length}</span>
                </span>
                <span className="kpi-d truncate">{conditionLine(filter)}</span>
              </div>
            </div>
            {median !== null && (
              <div className="min-w-0 max-md:hidden">
                <div className="kpi h-full">
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

          {/* 대표 그림 — 결과(스크리너). md+ 표 · 폰 카드 목록 */}
          <section className="card rounded-2xl p-4 max-md:p-3.5" data-reveal="">
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
                /* [1026] 빈 결과 — 회색 견본(카드 윤곽) + 한 문장 */
                <div className="flex flex-col items-center gap-2 py-4">
                  <div className="flex w-full max-w-[360px] flex-col gap-1.5" aria-hidden="true">
                    {[92, 76, 60].map((w) => (
                      <span key={w} className="block h-3 rounded-full border border-dashed border-line-strong" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                  <p className="t-sub text-text-3">조건에 맞는 지역 없음</p>
                </div>
              ) : (
                <>
                  <div className="max-md:hidden">
                    <RankTable rows={filtered} maxRatio={maxRatio} yieldFailed={yieldFailed} showYield={showYield} />
                  </div>
                  <div className="md:hidden">
                    <RankCards rows={filtered.slice(0, shown)} maxRatio={maxRatio} />
                    {shown < filtered.length && (
                      <button
                        type="button"
                        onClick={() => setShown(nextCardCount(shown, filtered.length))}
                        className="btn-soft btn-md mt-2 w-full"
                      >
                        더 보기 · {filtered.length - shown}곳 남음
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <p className="mt-2 t-sub text-text-3">갭이 작은 지역은 역전세·매매가·전세가 역전 위험도 함께 큼 · 안전하다는 뜻 아님</p>
          </section>

          {/* 폰 — 다음 행동 카드(텍스트 링크 · 채움 파랑은 하단 바) */}
          <div className="lg:hidden">{actionCard}</div>
        </div>

        {/* 레일(lg+) — 조건 · 내 예산(손잡이) · 다음 행동 */}
        <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start">
          {panel}
          {actionCard}
        </aside>
      </div>

      {/* [1026] 폰 하단 바 — 레일의 채움 파랑과 같은 요소(화면에 한 번) */}
      <RegionPrimaryBar regionLabel={leadRegion} />
    </>
  );
}
