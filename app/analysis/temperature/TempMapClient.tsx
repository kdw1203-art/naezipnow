"use client";

/* [1021 · 지역 시세 temperature] 온도 허브 본문 — 시안(mock8/temp)대로.
   머리(아이콘 칩·제목·사실 한 줄 | 주 선택 칩·권역) → 타일 5칸(내 관심 지역은 구독 지역이 있을 때만) →
   온도 타일 지도(69곳 색 타일 = 그 지역 기록 링크 · 범례 · 목록 보기 토글) → 12주 온도 선(주간 기록이 있을 때만) |
   레일: 온도 높은 순 8곳 + 전체 · 이어서 칩. 폰은 한 열(레일은 본문 아래).
   숫자는 서버가 이미 낸 값만(주마다 weekStats — 예전 히어로 KPI 와 같은 식). 주 전환·권역·타일/목록은 클라이언트 상태. */
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { Explain } from "@/app/components/explain/Explain";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import type { TemperatureLatest } from "@/lib/market/temperature-archive";
import { formatWeekKorean, formatWeekLabel } from "@/lib/market/week-label";
import { getSessionLite } from "@/lib/client/session-lite";
import { fetchUserRegions, readUserRegionsLocal, type UserRegion } from "@/lib/me/user-regions";
import { TEMPERATURE_EXPLAIN } from "../temperature-explain";
import { TempRegionCard } from "./TempRegionCard";
import { DiffBadge } from "./score-diff";
import {
  TEMP_BANDS,
  WEEK_CHIPS,
  filterBySido,
  matchWatchRegion,
  sidoOptions,
  tempBand,
  weekStats,
  type WeekKey,
} from "./temp-map-model";

export type WeekView = {
  key: WeekKey;
  weekStart: string;
  rows: TemperatureLatest[];
};

export type HistoryView = {
  regionId: string;
  regionLabel: string;
  /** 7일 간격 칸(week-slots) — 기록이 빠진 주는 score null */
  slots: { weekStart: string; score: number | null; headline: string | null }[];
};

const PATH = "/analysis/temperature";
const RAIL_COUNT = 8;

/* [1015 · 규칙 B] "이 기록을 읽는 법" 네 문장 — 예전 화면의 ⓘ 그대로 */
const READ_HOW = [
  "값은 그 주에 마지막으로 관측한 온도. 주간 평균이 아니며 주가 넘어가면 그 값이 그대로 굳는다.",
  "타일·카드의 등락은 지난주 기록과의 점수 차이(▲ 오름 · ▼ 내림 · 보합). 없으면 그 지역의 직전 주 기록이 없다는 뜻.",
  "계산식을 바꾸면 공식 버전을 올려 함께 저장한다. 과거 기록을 새 공식으로 다시 칠하지 않는다.",
  "실거래 신고는 계약일로부터 최대 30일까지 늦어질 수 있어, 거래량 항은 신고가 마감되지 않은 이번 달을 빼고 계산한다.",
];

function ScoreDelta({ row }: { row: TemperatureLatest }) {
  if (!row.previous) return null;
  const d = row.current.score - row.previous.score;
  if (d === 0) return <span>보합</span>;
  return (
    <span>
      <span aria-hidden="true">{d > 0 ? "▲" : "▼"}</span>
      <span className="sr-only">지난주보다 {d > 0 ? "오름" : "내림"} </span>
      {Math.abs(d)}
    </span>
  );
}

/* 내 관심 지역 — 구독 지역(로컬 캐시 → 로그인이면 서버)이 기록 행과 맞을 때만 칸을 만든다.
   서버 화면은 ISR 이라 사람을 모른다 → 클라이언트 섬. 비회원은 세션 요청을 하지 않는다(getSessionLite 관문). */
function useWatchRegions(): UserRegion[] {
  const [regions, setRegions] = useState<UserRegion[]>([]);
  useEffect(() => {
    let alive = true;
    setRegions(readUserRegionsLocal());
    void getSessionLite()
      .then((s) => (s?.user?.email ? fetchUserRegions() : null))
      .then((r) => {
        if (alive && r) setRegions(r);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return regions;
}

export function TempMapClient({
  weeks,
  history,
  rail,
  totalCount,
}: {
  weeks: WeekView[];
  history: HistoryView | null;
  /** 레일 아래 "이어서" 칩(서버가 만든 AnalysisCrossLinks) */
  rail: ReactNode;
  /** 이번 주 기록 지역 수(제목 줄) */
  totalCount: number;
}) {
  const [weekKey, setWeekKey] = useState<WeekKey>(weeks[0]?.key ?? "this");
  const [sido, setSido] = useState<string | null>(null);
  const [view, setView] = useState<"tile" | "list">("tile");
  const watch = useWatchRegions();

  const week = weeks.find((w) => w.key === weekKey) ?? weeks[0];
  const sidos = useMemo(() => sidoOptions(weeks[0]?.rows ?? []), [weeks]);
  const rows = useMemo(() => (week ? filterBySido(week.rows, sido) : []), [week, sido]);
  const stats = useMemo(() => weekStats(rows), [rows]);
  const mine = useMemo(() => matchWatchRegion(watch, week?.rows ?? []), [watch, week]);
  const weekKorean = week ? formatWeekKorean(week.weekStart) : null;
  const chipLabel = WEEK_CHIPS.find((c) => c.key === weekKey)?.label ?? "이번 주";

  const railList = (
    <div className="card rounded-2xl p-3.5">
      <div className="t-sub font-bold text-text-3">
        온도 높은 순 · {rows.length}곳
        {sido ? ` · ${sido}` : ""}
      </div>
      <ol className="lq-panel mt-1 divide-y" data-tone="plain">
        {rows.slice(0, RAIL_COUNT).map((r) => {
          const band = tempBand(r.current.score);
          return (
            <li key={r.current.regionId} className="flex items-center justify-between gap-2 py-[7px]">
              <Link
                href={`${PATH}/${encodeURIComponent(r.current.regionId)}`}
                className="t-sub inline-flex min-h-[24px] min-w-0 items-center gap-2 text-ink no-underline"
              >
                <b
                  className={`t-num w-6 shrink-0 font-bold ${
                    band === "hot" || band === "warm" ? "text-brand-red" : "text-ink"
                  }`}
                >
                  {r.current.score}
                </b>
                <span className="truncate">{r.current.regionLabel}</span>
              </Link>
              <span className="t-sub shrink-0 text-text-3">
                <ScoreDelta row={r} />
              </span>
            </li>
          );
        })}
      </ol>
      {rows.length > RAIL_COUNT && (
        <a
          href="#temp-map"
          onClick={() => setView("list")}
          className="t-sub mt-1.5 inline-flex min-h-[24px] items-center font-bold text-primary no-underline"
        >
          {rows.length}곳 전체 ›
        </a>
      )}
    </div>
  );

  return (
    <>
      {/* 머리 — 아이콘 칩 · 제목 · 사실 한 줄 | 주 선택 칩 · 권역 */}
      <header className="pxs-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="tile-ico flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon name="flame" size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="t-display text-ink">지역별 시장 온도</h1>
            <p className="t-sub inline-flex flex-wrap items-center gap-0.5 text-text-3">
              0~100 · 50 중립 · 매매가격지수 + 거래량 · 매주 기록 · {totalCount}곳
              {weeks[0] && ` (${formatWeekKorean(weeks[0].weekStart)} 주)`}
              <Explain {...TEMPERATURE_EXPLAIN} size={12} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="기준 주">
          {WEEK_CHIPS.filter((c) => weeks.some((w) => w.key === c.key)).map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setWeekKey(c.key)}
              aria-pressed={weekKey === c.key}
              className={`chip press min-h-10 border px-3 py-1.5 t-sub ${
                weekKey === c.key ? "chip-active" : "border-line bg-surface text-text-2"
              }`}
            >
              {c.label}
            </button>
          ))}
          {sidos.length > 1 && (
            <select
              value={sido ?? ""}
              onChange={(e) => setSido(e.target.value || null)}
              aria-label="권역"
              className="min-h-10 rounded-lg border border-line bg-surface px-2.5 py-1 t-sub font-bold text-ink"
            >
              <option value="">전체 권역</option>
              {sidos.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* 타일 — 평균 · 가장 뜨거운 · 가장 차가운 · 지난주 대비 · 내 관심 지역(있을 때만) */}
      <div className="tmp-stat mt-3">
        {stats.avg !== null && (
          <div className="kpi">
            <span className="kpi-k">평균 온도</span>
            <span className="kpi-v">{stats.avg}</span>
            <span className="kpi-d">
              {stats.count}곳 · {chipLabel}
              {sido ? ` · ${sido}` : ""}
            </span>
          </div>
        )}
        {stats.hottest && (
          <div className="kpi">
            <span className="kpi-k">가장 뜨거운 곳</span>
            <span className="kpi-v truncate">
              {stats.hottest.current.regionLabel} {stats.hottest.current.score}
            </span>
            <span className="kpi-d truncate">{stats.hottest.current.headline}</span>
          </div>
        )}
        {stats.coldest && (
          <div className="kpi">
            <span className="kpi-k">가장 차가운 곳</span>
            <span className="kpi-v truncate">
              {stats.coldest.current.regionLabel} {stats.coldest.current.score}
            </span>
            <span className="kpi-d truncate">{stats.coldest.current.headline}</span>
          </div>
        )}
        {stats.compared > 0 && (
          <div className="kpi">
            <span className="kpi-k">지난주 대비</span>
            <span className="kpi-v inline-flex items-baseline gap-1.5">
              <span className="delta-up">
                <span aria-hidden="true">▲</span>
                <span className="sr-only">오른 곳</span>
                {stats.rising}
              </span>
              <span aria-hidden="true" className="text-text-3">
                ·
              </span>
              <span className="delta-down">
                <span aria-hidden="true">▼</span>
                <span className="sr-only">내린 곳</span>
                {stats.falling}
              </span>
            </span>
            <span className="kpi-d">비교 가능한 {stats.compared}곳 중 오른 곳 · 내린 곳</span>
          </div>
        )}
        {mine && (
          <Link href={`${PATH}/${encodeURIComponent(mine.current.regionId)}`} className="kpi tile no-underline">
            <span className="kpi-k">내 관심 지역</span>
            <span className="kpi-v truncate">
              {mine.current.regionLabel} {mine.current.score}
            </span>
            <span className="kpi-d inline-flex items-center gap-1">
              {mine.previous ? <DiffBadge diff={mine.current.score - mine.previous.score} /> : mine.current.headline}
            </span>
          </Link>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <main className="min-w-0">
          {/* 온도 타일 지도 */}
          <section id="temp-map" className="card scroll-mt-20 rounded-2xl p-4" data-reveal="">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="t-section inline-flex items-center gap-0.5 text-ink">
                온도 지도 · {weekKorean} 주
                <Explain {...TEMPERATURE_EXPLAIN} body={READ_HOW} />
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <ul className="tmp-legend" aria-label="색 범례">
                  {TEMP_BANDS.map((b) => (
                    <li key={b.band}>
                      <i data-band={b.band} aria-hidden="true" />
                      {b.label}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setView(view === "tile" ? "list" : "tile")}
                  className="chip press min-h-10 border border-line bg-surface px-3 py-1.5 t-sub text-text-2"
                  aria-pressed={view === "list"}
                >
                  {view === "tile" ? "목록 보기" : "타일 보기"}
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="t-sub py-6 text-center text-text-3">{sido} 기록 없음</p>
            ) : view === "tile" ? (
              <ul className="mt-3 grid grid-cols-4 gap-1.5 md:grid-cols-6 lg:grid-cols-9" aria-label={`${weekKorean} 주 온도 타일`}>
                {rows.map((r) => (
                  <li key={r.current.regionId} className="min-w-0">
                    <Link
                      href={`${PATH}/${encodeURIComponent(r.current.regionId)}`}
                      className="tmp-tile press no-underline"
                      data-band={tempBand(r.current.score)}
                      title={`${r.current.regionLabel} ${r.current.score} · ${r.current.headline}`}
                    >
                      <span className="tmp-tile-v t-num">{r.current.score}</span>
                      <span className="tmp-tile-k">{r.current.regionLabel}</span>
                      <span className="tmp-tile-d">
                        <ScoreDelta row={r} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rows.map(({ current, previous }) => (
                  <TempRegionCard
                    key={current.regionId}
                    current={current}
                    previous={previous}
                    href={`${PATH}/${current.regionId}`}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 t-sub text-text-3">그 주에 마지막으로 관측한 값(주간 평균 아님) · 타일을 누르면 그 지역 기록</p>
          </section>

          {/* 12주 온도 — 주간 기록이 있을 때만(1위 지역) */}
          {history && history.slots.length >= 2 && (
            <section className="card mt-3 rounded-2xl p-4" data-reveal="">
              <h2 className="t-section text-ink">
                {history.regionLabel} · 최근 {history.slots.filter((s) => s.score !== null).length}주 온도
              </h2>
              <div className="mt-2">
                <ScrubLineLazy
                  values={history.slots.map((s) => s.score)}
                  labels={history.slots.map((s) => formatWeekLabel(s.weekStart))}
                  fullLabels={history.slots.map(
                    (s) => `${formatWeekKorean(s.weekStart)} 주${s.headline ? ` · ${s.headline}` : " · 기록 없음"}`,
                  )}
                  format="int"
                  suffix="점"
                  tone="auto"
                  height={120}
                  ariaLabel={`${history.regionLabel} 시장 온도 최근 주간 추이`}
                  yDomain={[0, 100]}
                  refLine={{ value: 50, label: "중립 50" }}
                  footnote="세로축 0~100점 · 가로 점선 = 중립 50 · 기록이 빠진 주는 점선으로 건너뜀"
                />
              </div>
              <Link
                href={`${PATH}/${encodeURIComponent(history.regionId)}`}
                className="t-sub mt-1 inline-flex min-h-[24px] items-center font-bold text-primary no-underline"
              >
                {history.regionLabel} 주간 기록 전체 ›
              </Link>
            </section>
          )}

          {/* 폰 — 레일 내용을 본문 아래 한 열로(같은 내용을 두 자리 중 한 곳에만) */}
          <div className="mt-3 flex flex-col gap-3 lg:hidden">
            {railList}
            {rail}
          </div>
        </main>

        <aside className="hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start">
          {railList}
          {rail}
        </aside>
      </div>
    </>
  );
}
