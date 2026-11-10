/* [1110 · AI 분석 2차 통폐합] "지역 시세 분석" 입구 — 서버 조각. 허브(/analysis #tier-market)와 /analysis/timing(독립 화면)이 같은 조각을 그린다.
   소유자 2026-11-07: 지역 시세 도구 5줄 → 하나 — "눌렀을 때 지역을 검색하거나 지역(시 · 구 · 동) 단위로 분석해서 종합적으로".
   구성: 검색칸(시 · 구는 즉시 · 동은 검색 API) → 시/도 필터(규칙: 5개를 넘으면 필터식 — 107곳을 한 번에 펼치지 않는다) → 그 시/도의
   시 · 구 줄(지금 값: 평균 매매가 · 전세가율 · 시장 온도) → 종합 화면 /region/[id](개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 · 월간 리포트 탭 · 1101).
   예전 다섯 도구가 하던 일은 그 종합 화면과 비교 화면(전국 온도 지도 · 전세가율·갭 순위 · 시나리오)이 맡는다 — 같은 사실을 두 곳에 두지 않는다.
   데이터: 부동산원 스냅샷 전 지역(getAllRegionSnapshots · 갭 스크리너와 같은 표) + 이번 주 시장 온도(listLatestTemperatures · 온도 지도와 같은 표).
   둘 다 프리렌더 예산 안(20초)에서 읽고, 못 읽으면 그 칸이 "—" + "불러오기 실패 · 잠시 후 다시" 한 줄 — 빈 값으로 위장하지 않는다. */
import { isCollectingFromEmpty, COLLECTING_LINE } from "@/lib/market/fresh-db";
import Link from "@/app/components/IntentLink";
import { REGION_ALIASES, REGION_CATALOG } from "@/lib/region/catalog";
import { findTemperatureRegion } from "@/lib/market/temperature";
import { getAllRegionSeriesSince, getAllRegionSnapshots } from "@/lib/market/store";
import { buildTickerPages, seriesSince, type TickerPage } from "@/lib/region/region-ticker";
import { RegionTickerBoard } from "./region-ticker-board";
import { listLatestTemperatures } from "@/lib/market/temperature-archive";
import { formatWeekKorean } from "@/lib/market/week-label";
import { formatKrwShort, formatYm } from "@/lib/market/format";
import { LOAD_FAILED_LINE, loadWithinPrerenderBudget } from "@/lib/data/prerender-budget";
import {
  buildRegionSiseGroups,
  listRegionSiseRegions,
  type RegionSiseGroup,
  type RegionSiseRegion,
  type RegionSiseRow,
} from "@/lib/region/region-sise";
import { RegionSiseClient } from "./region-sise-client";
import { regionSiseMapMarkers, type RegionMapMarker } from "@/lib/region/region-map";
import { TOOL_COL_GO, TOOL_COL_NAME } from "./tool-cols";

export type RegionSiseData = {
  regions: RegionSiseRegion[];
  groups: RegionSiseGroup[];
  /** [1111] 지도 보기 말풍선(값 = 평균 매매가 · 없으면 온도) */
  markers: RegionMapMarker[];
  /** 스냅샷 기준월("2026.10") — 못 읽었으면 null */
  periodLabel: string | null;
  /** 온도 기록 주("11월 둘째 주") — 못 읽었으면 null */
  weekLabel: string | null;
  snapshotFailed: boolean;
  tempFailed: boolean;
  /** [1115] 시세판 쪽(서울 주요 구 · 상승 · 하락 — 쪽마다 16칸) */
  tickerPages: TickerPage[];
  tickerFailed: boolean;
  /** [1133] 새로 만든 DB — 실거래 0건(수집 시작 전) */
  collecting: boolean;
};

const BUDGET_MS = 20_000;

export async function loadRegionSiseData(what = "[region-sise]"): Promise<RegionSiseData> {
  /* [1112] 지수 · 온도가 있는 62곳은 대시보드(/analysis/timing?region=)로 — 소유자 "이런 식으로 해줘". 그 밖은 지역 종합 화면 */
  const regions = listRegionSiseRegions(REGION_CATALOG, REGION_ALIASES).map((r) =>
    findTemperatureRegion(r.id) ? { ...r, href: `/analysis/timing?region=${encodeURIComponent(r.id)}` } : r,
  );
  const [snap, temp, series] = await Promise.all([
    loadWithinPrerenderBudget(`${what} 스냅샷`, () => getAllRegionSnapshots(), BUDGET_MS),
    loadWithinPrerenderBudget(`${what} 온도`, () => listLatestTemperatures(), BUDGET_MS),
    /* [1115] 시세판 선 — 전 지역 월간 매매가격지수 14개월(쪽 나눔 한 묶음) */
    loadWithinPrerenderBudget(`${what} 지수 시계열`, () => getAllRegionSeriesSince("sale_index", "monthly", seriesSince(new Date())), BUDGET_MS),
  ]);
  /* 스냅샷 0행은 키 부재 · 재적재 창 — "값이 없는 지역 107곳"이 아니라 못 읽은 것이다(lib/market/store 주석) */
  const snapshots = snap.ok && snap.data.size > 0 ? snap.data : null;
  const temps = temp.ok ? temp.data.rows.map((r) => r.current) : null;
  let periodLabel: string | null = null;
  if (snapshots) {
    const counts = new Map<string, number>();
    for (const s of snapshots.values()) counts.set(s.period, (counts.get(s.period) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    periodLabel = top ? formatYm(top[0]) : null;
  }
  const groups = buildRegionSiseGroups(regions, snapshots, temps);
  const seriesMap = series.ok && series.data.size > 0 ? series.data : null;
  /* [1133] 새로 만든 DB(실거래 0건)면 0행은 조회 이상이 아니라 수집 시작 전이다 — "불러오기 실패"라고 하지 않는다 */
  const collecting = (snapshots === null || seriesMap === null) && snap.ok && series.ok ? await isCollectingFromEmpty() : false;
  const coords = new Map(REGION_CATALOG.map((r) => [r.id, { lat: r.lat, lng: r.lng }] as const));
  return {
    regions,
    groups,
    tickerPages: seriesMap ? buildTickerPages(groups.flatMap((g) => g.rows), seriesMap) : [],
    tickerFailed: seriesMap === null && !collecting,
    collecting,
    markers: regionSiseMapMarkers(groups.flatMap((g) => g.rows), coords, formatKrwShort),
    periodLabel,
    weekLabel: temp.ok && temp.data.weekStart ? formatWeekKorean(temp.data.weekStart) : null,
    snapshotFailed: snapshots === null && !collecting,
    tempFailed: temps === null,
  };
}

function Row({ r }: { r: RegionSiseRow }) {
  return (
    <tr className="border-b border-line last:border-b-0 hover:bg-bg">
      <td className="px-3 py-1.5">
        <Link href={r.href} className="press flex min-h-11 min-w-0 items-center gap-2 no-underline">
          <span className="min-w-0">
            <span className="block t-body font-bold text-ink">{r.name}</span>
            <span className="block t-caption text-text-3 md:hidden">
              {r.avgSaleKrw !== null ? `평균 ${formatKrwShort(r.avgSaleKrw)}` : "평균 —"}
              {r.temp ? ` · 온도 ${r.temp.score}` : ""}
            </span>
          </span>
        </Link>
      </td>
      <td className="hidden px-2 py-1.5 t-sub t-num text-ink md:table-cell">{r.avgSaleKrw !== null ? formatKrwShort(r.avgSaleKrw) : "—"}</td>
      <td className="hidden px-2 py-1.5 t-sub t-num text-text-2 md:table-cell">{r.jeonseRatio !== null ? `${r.jeonseRatio.toFixed(1)}%` : "—"}</td>
      <td className="hidden px-2 py-1.5 t-sub text-text-2 md:table-cell">
        {r.temp ? (
          <>
            <span className="t-num font-bold text-ink">{r.temp.score}</span>
            <span className="text-text-3">/100 · {r.temp.headline}</span>
            {/* [1115 · 그래프] 0~100 막대 — 50 = 중립(가운데 눈금) · 높으면 빨강(뜨거움) · 낮으면 파랑(차가움). 숫자는 위 글자가 말한다 */}
            <span className="relative mt-1 block h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-divider" aria-hidden="true">
              <span
                className={`block h-full rounded-full ${r.temp.score >= 55 ? "bg-up" : r.temp.score <= 45 ? "bg-down" : "bg-text-3"}`}
                style={{ width: `${Math.max(3, Math.min(100, r.temp.score))}%` }}
              />
              <span className="absolute inset-y-0 left-1/2 w-px bg-surface" />
            </span>
          </>
        ) : (
          "—"
        )}
      </td>
      <td className={`px-3 text-right t-body text-text-3 ${TOOL_COL_GO}`} aria-hidden="true">
        {/* dead-control-ok: 줄의 링크가 이름 칸에 있다 — 화살표는 그 표시 */}›
      </td>
    </tr>
  );
}

function Panel({ g }: { g: RegionSiseGroup }) {
  return (
    <div className="card overflow-hidden rounded-2xl">
      <table className="w-full border-collapse md:table-fixed">
        <thead className="max-md:hidden">
          <tr className="border-b border-line bg-bg text-left t-caption text-text-3">
            <th scope="col" className={`px-3 py-2 font-bold ${TOOL_COL_NAME}`}>지역</th>
            <th scope="col" className="px-2 py-2 font-bold">평균 매매가</th>
            <th scope="col" className="px-2 py-2 font-bold">전세가율</th>
            <th scope="col" className="px-2 py-2 font-bold">시장 온도</th>
            <th scope="col" className={`px-3 py-2 ${TOOL_COL_GO}`}>
              <span className="sr-only">열기</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {g.rows.map((r) => (
            <Row key={r.id} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RegionSiseEntry({ data, autoFocus = false }: { data: RegionSiseData; autoFocus?: boolean }) {
  const failed = [data.snapshotFailed ? "평균 매매가 · 전세가율" : null, data.tempFailed ? "시장 온도" : null].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      {/* [1115] 시세판 — 4×4 칸(폰 2×4) · 쪽이 아래에서 위로 넘어간다(서울 주요 구 → 상승 큰 곳 → 하락 큰 곳) */}
      <RegionTickerBoard pages={data.tickerPages} failed={data.tickerFailed} />
      {/* [1111] 검색칸 + [표 | 지도] — 판(표)은 여기서 그려 넘긴다(서버 HTML) · 지도는 고를 때만 */}
      <RegionSiseClient
        regions={data.regions}
        markers={data.markers}
        autoFocus={autoFocus}
        sidos={data.groups.map((g) => g.sido)}
        counts={data.groups.map((g) => g.rows.length)}
        panels={data.groups.map((g) => <Panel key={g.sido} g={g} />)}
      />
      <p className="m-0 px-1 t-caption text-text-3">
        {data.collecting ? `${COLLECTING_LINE} · ` : ""}
        {failed.length > 0 ? `${failed.join(" · ")} ${LOAD_FAILED_LINE} · ` : ""}
        평균 매매가 · 전세가율 = 한국부동산원 공표 통계{data.periodLabel ? ` ${data.periodLabel} 기준` : ""} · 시장 온도 = 매주 기록한 0~100점
        {data.weekLabel ? `(${data.weekLabel})` : ""} · 지역을 고르면 개요 · 실거래 구간 · 전월세 · 시장 온도 · 동네 · 월간 리포트
      </p>
      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 t-sub">
        <span className="text-text-3">지역 비교</span>
        <Link href="/analysis/temperature" className="tap-line font-bold text-text-2 no-underline hover:underline">
          전국 시장 온도 지도 ›
        </Link>
        <Link href="/analysis/gap" className="tap-line font-bold text-text-2 no-underline hover:underline">
          전세가율·갭 순위 ›
        </Link>
        <Link href="/analysis/scenario" className="tap-line font-bold text-text-2 no-underline hover:underline">
          시장·대출 시나리오 ›
        </Link>
      </p>
    </div>
  );
}
