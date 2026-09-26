/**
 * [1010] "바뀐 지역만" 을 경로 목록으로 바꾸는 순수 규칙.
 *
 * ── 왜 이 파일이 따로 있나 ──────────────────────────────────────────────
 * 지역·실거래 축의 ISR TTL 을 6~24시간에서 7일로 늘리는 대신, **바뀐 지역만**
 * 즉시 비운다(1010 브리프 원칙 1). 그 "바뀐 지역"을 고르는 규칙은 DB 조회와
 * 섞이면 테스트가 안 되므로 여기 순수 함수로 모은다. DB 조회·revalidatePath 는
 * lib/region/invalidate-market.ts 가 맡는다.
 *
 * ── 실측 근거(2026-09-20~22 Vercel 청구 · 하루 렌더) ────────────────────
 *   /tx/[region]/[kind]/[band] 2,092 · /region/[id] 870 — 사람 방문보다 크롤러가
 *   압도적이다. TTL 이 크롤러 재방문 간격(≈2.2일)보다 짧으면 방문 때마다 거의
 *   100% 재렌더가 돈다. 그런데 국토부 실거래 수집은 시군구 슬라이스 회전이라
 *   하루에 바뀌는 지역은 수십 곳뿐이다 — 나머지 150여 곳은 7일 내내 HIT 여도
 *   사실이 틀리지 않는다.
 *
 * 여기 규칙은 전부 "추측하지 않는다" 를 따른다: 실제로 존재하는 카탈로그 항목과
 * 대조해서만 id 를 만든다(lib/market/tx-bands.ts 의 같은 원칙).
 */
import { REGION_CATALOG } from "@/lib/region/catalog";
import { marketRegionNameCandidates } from "@/lib/market/region-name-candidates";

/**
 * 실거래 지역명("서울 강남구") → 카탈로그 id("gangnam") 역방향 표.
 *
 * 왜 findCatalogRegionByName() 을 쓰지 않는가: 그 함수의 마지막 단계는 **부분
 * 일치**라 "부산 강서구" 가 서울 강서구(gangseo)로 붙는다(카탈로그 선언 순서상
 * 서울이 먼저다). 지역 페이지를 엉뚱한 곳에서 비우는 건 안 비우는 것보다 나쁘다.
 * 그래서 정방향(카탈로그 id+이름 → 실거래 표기 후보)으로만 표를 만들고 정확
 * 일치로 되돌린다 — marketRegionNameCandidates 는 사이트맵·지역 허브가 이미
 * 쓰는 같은 규칙이다.
 *
 * 같은 후보 이름이 둘 이상 나오면 먼저 선언된 항목이 이긴다(카탈로그는 서울 →
 * 수도권 → 광역시 순). 실측상 충돌은 없지만, 충돌하면 조용히 덮지 않고 먼저
 * 것을 유지한다 — 덮어쓰면 어느 쪽이 남았는지 알 수 없다.
 */
const CATALOG_ID_BY_TX_NAME: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const info of REGION_CATALOG) {
    for (const candidate of marketRegionNameCandidates(info.id, info.name)) {
      if (!map.has(candidate)) map.set(candidate, info.id);
    }
  }
  return map;
})();

/** 실거래 지역명 하나 → 카탈로그 id. 카탈로그에 없으면 null(지어내지 않는다). */
export function catalogIdForTxRegionName(name: string): string | null {
  return CATALOG_ID_BY_TX_NAME.get(name.trim()) ?? null;
}

/** 실거래 지역명 여러 개 → 카탈로그 id 목록(중복 제거, 못 찾은 것은 버린다). */
export function catalogIdsForTxRegionNames(names: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const id = catalogIdForTxRegionName(typeof n === "string" ? n : "");
    if (id) out.add(id);
  }
  return [...out];
}

/** 지역 슬러그 — 공백만 하이픈으로. lib/market/tx-bands.ts regionToSlug 와 같은 규칙.
 *  (tx-bands 는 server-only 라 node:test 가 못 부른다 — 규칙 사본이 아니라 같은 한 줄이다) */
export function txRegionSlug(regionName: string): string {
  return regionName.trim().replace(/\s+/g, "-");
}

/** invalidate 대상이 되는 구간 셀 — DB 행에서 필요한 것만 */
export type ChangedBandCell = {
  regionName: string;
  /** "area" | "price" — 그 밖의 값은 경로를 만들지 않는다 */
  bandKind: string;
  bandKey: string;
};

/**
 * 바뀐 구간 셀 목록 → /tx 경로 목록.
 *
 * - `/tx/{slug}`                  지역 허브(그 지역 셀이 하나라도 바뀌면 총계가 바뀐다)
 * - `/tx/{slug}/{kind}/{band}`    바뀐 셀만
 *
 * 왜 라우트 전체 비움(revalidatePath("/tx/[region]/[kind]/[band]", "page"))을 쓰지
 * 않는가: 그러면 1,403개 셀 전부가 stale 이 되어, 크롤러가 하루에 2,092번 도는
 * 지금 구조에서는 **하루 1회 전량 재렌더**로 수렴한다(= 지금의 24시간 TTL 과 같다).
 * 반면 하루에 실제로 바뀌는 지역은 molit 회전 슬라이스(회당 16~24 시군구)뿐이라,
 * 셀 단위로 고르면 하루 수백 건으로 줄고 나머지는 7일 내내 CDN HIT 다.
 * 경로 수가 예산(REVALIDATE_BUDGET 800)을 넘기면 남는 것은 7일 TTL 이 받는다.
 *
 * 인코딩은 하지 않는다 — revalidatePath 는 라우터 경로를 그대로 받는다(한글 세그먼트
 * 포함). 링크(<Link href>)에서만 encodeURIComponent 를 쓴다.
 */
export function txPathsForChangedCells(cells: Iterable<ChangedBandCell>): string[] {
  const regionSlugs = new Set<string>();
  const cellPaths = new Set<string>();
  for (const c of cells) {
    const name = (c.regionName ?? "").trim();
    if (!name) continue;
    const slug = txRegionSlug(name);
    regionSlugs.add(`/tx/${slug}`);
    if (c.bandKind !== "area" && c.bandKind !== "price") continue;
    const key = (c.bandKey ?? "").trim();
    if (!key) continue;
    cellPaths.add(`/tx/${slug}/${c.bandKind}/${key}`);
  }
  return [...regionSlugs, ...cellPaths];
}

/**
 * 공개 임장노트의 지역 텍스트가 이 지역 페이지에 실리는가.
 *
 * app/region/[id]/page.tsx 가 화면을 그릴 때 쓰는 바로 그 판정이다. 예전에는 그
 * 파일 안에만 있어서, "노트를 공개하면 어느 지역 페이지가 바뀌는가" 를 쓰기 쪽
 * (POST /api/inspection/notes)이 알 방법이 없었다. TTL 을 7일로 늘리려면 쓰기
 * 지점이 같은 판정을 써야 한다(1010 브리프 원칙 3: 사람이 쓴 것은 즉시 보인다).
 */
export function noteMatchesRegion(noteRegion: string, regionName: string): boolean {
  const target = (noteRegion ?? "").replace(/\s+/g, "");
  if (!target) return false;
  const full = regionName.replace(/\s+/g, "");
  if (target.includes(full) || full.includes(target)) return true;
  const lastToken = regionName.trim().split(/\s+/).pop() ?? "";
  return lastToken.length >= 2 && target.includes(lastToken);
}

/** 이 노트가 실리는 지역 페이지의 카탈로그 id 목록(없으면 빈 배열). */
export function catalogIdsForNoteRegion(noteRegion: string): string[] {
  const text = (noteRegion ?? "").trim();
  if (!text) return [];
  return REGION_CATALOG.filter((r) => noteMatchesRegion(text, r.name)).map((r) => r.id);
}

/**
 * 완결 월 슬러그 — 신고 지연(계약 후 30일)이 계속 값을 바꾸는 최근 몇 달만.
 *
 * /reports/{yyyymm} 과 /region/{id}/report/{yyyy-mm} 두 형식이 있다. 2024-01
 * 이전은 아카이브 시작점 밖이라 만들지 않는다(lib/region/monthly-report.ts 와 동일).
 *
 * 왜 전부가 아니라 최근 n개월인가: 2년 전 달의 집계는 더 이상 바뀌지 않는데,
 * 라우트 전체를 비우면 그런 달까지 stale 이 되어 크롤러가 올 때마다 다시 그린다.
 */
export function recentReportMonths(n = 3, now: Date = new Date()): Array<{ ym: string; slug: string }> {
  const out: Array<{ ym: string; slug: string }> = [];
  for (let i = 1; i <= n; i += 1) {
    const t = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = String(t.getFullYear());
    const mm = String(t.getMonth() + 1).padStart(2, "0");
    const ym = `${yyyy}${mm}`;
    if (ym < "202401") break;
    out.push({ ym, slug: `${yyyy}-${mm}` });
  }
  return out;
}

/** 전국 월간 리포트 경로 — 최근 완결 월만 */
export function nationalReportPaths(n = 3, now: Date = new Date()): string[] {
  return recentReportMonths(n, now).map((m) => `/reports/${m.ym}`);
}

/** 바뀐 지역의 월간 리포트 경로(아카이브 인덱스 + 최근 완결 월) */
export function regionReportPaths(
  regionIds: Iterable<string>,
  n = 3,
  now: Date = new Date(),
): string[] {
  const months = recentReportMonths(n, now);
  const out: string[] = [];
  for (const raw of regionIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    out.push(`/region/${id}/report`);
    for (const m of months) out.push(`/region/${id}/report/${m.slug}`);
  }
  return out;
}

/**
 * REB 지역 스냅샷 지문 — /region/[id] 머리(시세·지수·거래량 요약)에 실제로 실리는 값만.
 *
 * 왜 지문을 비교하나: reb-ingest 는 매일 돌지만 한국부동산원 공표는 주간·월간이다.
 * upsertRegionPrices 가 updated_at 을 매번 새로 쓰기 때문에 DB 의 시각만으로는
 * "정말 바뀌었는가" 를 알 수 없고, 그대로 믿으면 매일 지역 103곳을 통째로 비우게
 * 된다(= TTL 을 늘린 의미가 사라진다). 적재 전후로 이 지문을 떠서 **값이 달라진
 * 지역만** 비운다. 공표가 없는 날은 0곳이다.
 */
export function rebSnapshotFingerprint(row: {
  period?: string | null;
  per_m2_sale?: number | string | null;
  avg_sale?: number | string | null;
  median_sale?: number | string | null;
  jeonse_ratio?: number | string | null;
  sale_change?: number | string | null;
  trade_count?: number | string | null;
}): string {
  const f = (v: number | string | null | undefined): string =>
    v === null || v === undefined ? "" : String(v);
  return [
    f(row.period),
    f(row.per_m2_sale),
    f(row.avg_sale),
    f(row.median_sale),
    f(row.jeonse_ratio),
    f(row.sale_change),
    f(row.trade_count),
  ].join("|");
}

/**
 * 적재 전후 지문 비교 → 값이 달라진 region_id 목록.
 * 새로 생긴 지역(before 에 없음)도 바뀐 것으로 센다 — 그 페이지는 지금까지
 * "부동산원 통계 없음" 으로 굳어 있었기 때문이다.
 * 사라진 지역은 세지 않는다(행이 사라지는 경로가 없고, 세면 비울 대상만 늘어난다).
 */
export function diffRegionFingerprints(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const out: string[] = [];
  for (const [id, fp] of after) {
    if (before.get(id) !== fp) out.push(id);
  }
  return out;
}
