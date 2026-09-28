"use client";
/* [1023 · AI 분석] 머리 통일 — h1 t-display 손 마크업(.pxs-head) → 공용 PageHead(t-title). 본문은 그대로. */

/* [1022 · 온도 지도] 지시 1 — 타일 지도를 우리나라 지도 모양으로.
   1단계 전국: 시/도 17개를 한반도 모양 격자(6열)에 놓은 타일(버튼 ≥40px · 이름·평균 온도·기록 지역 수). 기록 없는 시/도는 회색 "기록 없음"(누를 수 없음).
   2단계 시/도 안: 그 시/도의 시군구를 lat/lng 로 격자에 놓는다(데스크톱 8열 · 폰 5열, 같은 DOM 에 두 좌표를 CSS 변수로).
   타일은 기존 온도 타일(색·값·링크·범례 그대로). 위에 "전국 › 서울" + "전국으로", 오른쪽 시/도 칩 줄. URL 은 ?sido= 를 replaceState 로만 남긴다.
   권역 select 는 시/도 선택과 겹쳐 없앴다. "목록 보기" 토글·주 선택은 그대로.
   [1021 · 지역 시세 temperature] 온도 허브 본문 — 시안(mock8/temp)대로.
   머리(아이콘 칩·제목·사실 한 줄 | 주 선택 칩·권역) → 타일 5칸(내 관심 지역은 구독 지역이 있을 때만) →
   온도 타일 지도(69곳 색 타일 = 그 지역 기록 링크 · 범례 · 목록 보기 토글) → 12주 온도 선(주간 기록이 있을 때만) |
   레일: 온도 높은 순 8곳 + 전체 · 이어서 칩. 폰은 한 열(레일은 본문 아래).
   숫자는 서버가 이미 낸 값만(주마다 weekStats — 예전 히어로 KPI 와 같은 식). 주 전환·권역·타일/목록은 클라이언트 상태. */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { PageHead } from "@/app/components/PageHead";
import { Explain } from "@/app/components/explain/Explain";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import type { TemperatureLatest } from "@/lib/market/temperature-archive";
import { KOREA_TILE_COLS, cellMap, layoutByLatLng } from "@/lib/market/korea-tile-layout";
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
  layoutInputs,
  matchWatchRegion,
  nameInSido,
  sidoOptions,
  sidoTiles,
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
/* [1022] 2단계(시/도 안) 격자 열 수 — 데스크톱 8열 · 폰 5열(가로 스크롤 없음). 전국은 KOREA_TILE_COLS(6열, 폰도 같다) */
const SIDO_COLS = 8;
const SIDO_COLS_PHONE = 5;
const SIDO_PARAM = "sido";

/** [1022] ?sido= 를 주소에만 남긴다(replaceState — 서버 재렌더·라우터 이동 없음). 실패해도 화면은 상태로 돈다. */
function writeSidoParam(sido: string | null) {
  try {
    const url = new URL(window.location.href);
    if (sido) url.searchParams.set(SIDO_PARAM, sido);
    else url.searchParams.delete(SIDO_PARAM);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    /* 주소를 못 바꿔도 상태는 이미 바뀌었다 */
  }
}

function readSidoParam(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(SIDO_PARAM);
  } catch {
    return null;
  }
}

/** 격자 칸 좌표를 CSS 변수로 — 데스크톱(--c/--r)·폰(--cm/--rm). 값은 1부터(grid-column/row) */
function cellStyle(desk: { col: number; row: number }, phone?: { col: number; row: number }): CSSProperties {
  const p = phone ?? desk;
  return { "--c": desk.col + 1, "--r": desk.row + 1, "--cm": p.col + 1, "--rm": p.row + 1 } as CSSProperties;
}

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

  /* [1022] 1단계 전국 타일(시/도 평균·지역 수) · 2단계 시/도 안 lat/lng 배치(데스크톱·폰 두 열 수) */
  const nation = useMemo(() => sidoTiles(week?.rows ?? []), [week]);
  const sidoLayout = useMemo(() => {
    if (!sido || rows.length === 0) return null;
    const inputs = layoutInputs(rows);
    const desk = layoutByLatLng(inputs, SIDO_COLS);
    const phone = layoutByLatLng(inputs, SIDO_COLS_PHONE);
    const deskCells = cellMap(desk);
    const phoneCells = cellMap(phone);
    /* DOM 순서 = 데스크톱 격자 읽는 순서(위→아래, 왼→오른) — 키보드 이동이 지도 순서와 맞게 */
    const ordered = [...rows].sort((a, b) => {
      const ca = deskCells.get(a.current.regionId);
      const cb = deskCells.get(b.current.regionId);
      return (ca?.row ?? 0) - (cb?.row ?? 0) || (ca?.col ?? 0) - (cb?.col ?? 0);
    });
    return { desk, phone, deskCells, phoneCells, ordered };
  }, [sido, rows]);

  const selectSido = useCallback((next: string | null) => {
    setSido(next);
    writeSidoParam(next);
  }, []);

  /* 첫 진입 — 주소의 ?sido= 가 기록 있는 시/도면 그 단계로(서버는 쿼리를 읽지 않는다) */
  useEffect(() => {
    const s = readSidoParam();
    if (s && sidos.includes(s)) setSido(s);
  }, [sidos]);

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
      {/* 머리 — 아이콘 칩 · 제목 · 사실 한 줄 | 주 선택 칩. [1023] 공용 PageHead(t-title) */}
      <PageHead
        icon="flame"
        title="지역별 시장 온도"
        sub={
          <>
            0~100 · 50 중립 · 매매가격지수 + 거래량 · 매주 기록 · {totalCount}곳
            {weeks[0] && ` (${formatWeekKorean(weeks[0].weekStart)} 주)`}
            <Explain {...TEMPERATURE_EXPLAIN} size={12} />
          </>
        }
        subOnPhone
        actions={
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
          </div>
        }
      />

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

            {/* [1022] 2단계 머리 — 브레드크럼 "전국 › 서울" + "전국으로" | 시/도 칩 줄(다른 시/도로 바로) */}
            {sido && (
              <nav className="mt-3 flex flex-wrap items-center justify-between gap-2" aria-label="지도 단계">
                <div className="flex items-center gap-2">
                  <span className="t-sub font-bold text-ink" aria-current="location">
                    전국 › {sido}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectSido(null)}
                    className="chip press min-h-10 border border-line bg-surface px-3 py-1.5 t-sub text-text-2"
                  >
                    전국으로
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="시/도">
                  {sidos.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => selectSido(s)}
                      aria-pressed={s === sido}
                      className={`chip press min-h-10 border px-3 py-1.5 t-sub ${
                        s === sido ? "chip-active" : "border-line bg-surface text-text-2"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </nav>
            )}

            {rows.length === 0 ? (
              <p className="t-sub py-6 text-center text-text-3">{sido} 기록 없음</p>
            ) : view === "tile" && !sido ? (
              /* [1022] 1단계 — 전국 시/도 타일(한반도 모양 6열 격자). 타일 = 버튼 → 2단계 */
              <ul
                className="tm-grid tm-nation mt-3"
                style={{ "--tm-cols": KOREA_TILE_COLS, "--tm-cols-m": KOREA_TILE_COLS } as CSSProperties}
                aria-label={`${weekKorean} 주 전국 시/도 온도 타일`}
              >
                {nation.map((t) =>
                  t.count > 0 && t.avg !== null ? (
                    <li key={t.key} className="tm-cell min-w-0" style={cellStyle(t)}>
                      <button
                        type="button"
                        onClick={() => selectSido(t.key)}
                        className="tmp-tile tm-sido press"
                        data-band={t.band ?? undefined}
                        title={`${t.label} 평균 ${t.avg} · ${t.count}곳`}
                      >
                        <span className="tmp-tile-k">{t.label}</span>
                        <span className="tmp-tile-v t-num">{t.avg}</span>
                        <span className="tmp-tile-d">{t.count}곳</span>
                      </button>
                    </li>
                  ) : (
                    <li key={t.key} className="tm-cell min-w-0" style={cellStyle(t)}>
                      <span className="tmp-tile tm-sido" data-empty="" aria-disabled="true">
                        <span className="tmp-tile-k">{t.label}</span>
                        <span className="tmp-tile-d">기록 없음</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            ) : view === "tile" && sidoLayout ? (
              /* [1022] 2단계 — 시/도 안 시군구를 lat/lng 로 배치(경도→열 · 위도→행). 타일은 기존 온도 타일 그대로 */
              <ul
                className="tm-grid mt-3"
                style={{ "--tm-cols": sidoLayout.desk.cols, "--tm-cols-m": sidoLayout.phone.cols } as CSSProperties}
                aria-label={`${weekKorean} 주 ${sido} 온도 타일`}
              >
                {sidoLayout.ordered.map((r) => {
                  const id = r.current.regionId;
                  const d = sidoLayout.deskCells.get(id);
                  const p = sidoLayout.phoneCells.get(id);
                  return (
                    <li key={id} className="tm-cell min-w-0" style={d ? cellStyle(d, p) : undefined}>
                      <Link
                        href={`${PATH}/${encodeURIComponent(id)}`}
                        className="tmp-tile press no-underline"
                        data-band={tempBand(r.current.score)}
                        title={`${r.current.regionLabel} ${r.current.score} · ${r.current.headline}`}
                      >
                        <span className="tmp-tile-v t-num">{r.current.score}</span>
                        <span className="tmp-tile-k">{nameInSido(r.current.regionLabel, sido ?? "")}</span>
                        <span className="tmp-tile-d">
                          <ScoreDelta row={r} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
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
            <p className="mt-2 t-sub text-text-3">
              그 주에 마지막으로 관측한 값(주간 평균 아님) ·{" "}
              {sido || view === "list" ? "타일을 누르면 그 지역 기록" : "시/도 온도 = 기록 지역 평균 · 시/도를 누르면 그 안의 시군구"}
            </p>
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
