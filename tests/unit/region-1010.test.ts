/**
 * [1010] 지역·실거래·리포트 축 — "바뀐 것만 비운다" 규칙의 단위 테스트.
 *
 * 여기서 잠그는 것은 하나다: ISR TTL 을 6~24시간에서 7일(일부 1일)로 늘리면서,
 * "그 화면을 바꾸는 쓰기 지점" 이 **정확히 어떤 경로를 비워야 하는가** 를 계산하는
 * 순수 규칙. 이 규칙이 틀리면 TTL 을 늘린 만큼 그대로 틀린 화면이 굳는다.
 *
 * DB 조회·revalidatePath 는 lib/region/invalidate-market.ts(server-only)에 있어
 * node:test 가 부르지 못한다 — 그래서 규칙만 lib/region/changed-region-paths.ts 에
 * 따로 두었고, 이 파일은 그쪽을 본다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  catalogIdForTxRegionName,
  catalogIdsForNoteRegion,
  catalogIdsForTxRegionNames,
  diffRegionFingerprints,
  nationalReportPaths,
  noteMatchesRegion,
  rebSnapshotFingerprint,
  recentReportMonths,
  regionReportPaths,
  txPathsForChangedCells,
  txRegionSlug,
} from "@/lib/region/changed-region-paths";

/* ── 실거래 지역명 → 카탈로그 id ───────────────────────────────────────── */

test("실거래 표기('서울 강남구')를 카탈로그 id 로 되돌린다", () => {
  assert.equal(catalogIdForTxRegionName("서울 강남구"), "gangnam");
  assert.equal(catalogIdForTxRegionName("강남구"), "gangnam");
});

test("시도 접두가 다르면 같은 구 이름이라도 서로 다른 지역이다", () => {
  /* 부분 일치로 되돌리면 "부산 강서구" 가 서울 강서구로 붙는다(카탈로그 선언 순서).
     지역 페이지를 엉뚱한 곳에서 비우는 건 안 비우는 것보다 나쁘다 — 정확 일치만 쓴다. */
  const busan = catalogIdForTxRegionName("부산 강서구");
  assert.notEqual(busan, "gangseo");
  assert.equal(catalogIdForTxRegionName("서울 강서구"), "gangseo");
});

test("카탈로그에 없는 지역명은 지어내지 않는다", () => {
  assert.equal(catalogIdForTxRegionName("없는시 없는구"), null);
  assert.equal(catalogIdForTxRegionName("   "), null);
});

test("여러 지역명을 중복 없이 id 로 모은다", () => {
  const ids = catalogIdsForTxRegionNames([
    "서울 강남구",
    "강남구",
    "서울 송파구",
    "없는시 없는구",
    "",
  ]);
  assert.deepEqual([...ids].sort(), ["gangnam", "songpa"].sort());
});

/* ── /tx 경로 만들기 ──────────────────────────────────────────────────── */

test("지역 슬러그는 공백만 하이픈으로 바꾼다(한글 그대로)", () => {
  assert.equal(txRegionSlug("서울 강남구"), "서울-강남구");
  assert.equal(txRegionSlug(" 고양 덕양구 "), "고양-덕양구");
});

test("바뀐 셀만으로 /tx 경로를 만든다 — 지역 허브 + 그 셀", () => {
  const paths = txPathsForChangedCells([
    { regionName: "서울 강남구", bandKind: "area", bandKey: "a60-85" },
    { regionName: "서울 강남구", bandKind: "price", bandKey: "p10-15" },
    { regionName: "서울 송파구", bandKind: "area", bandKey: "a60-85" },
  ]);
  assert.deepEqual(paths.slice(0, 2), ["/tx/서울-강남구", "/tx/서울-송파구"]);
  assert.ok(paths.includes("/tx/서울-강남구/area/a60-85"));
  assert.ok(paths.includes("/tx/서울-강남구/price/p10-15"));
  assert.ok(paths.includes("/tx/서울-송파구/area/a60-85"));
  /* 바뀌지 않은 셀은 목록에 없다 — 그게 이 최적화의 전부다 */
  assert.equal(paths.length, 5);
});

test("모르는 band_kind 는 경로를 만들지 않는다(지역 허브만 남는다)", () => {
  const paths = txPathsForChangedCells([
    { regionName: "서울 강남구", bandKind: "households", bandKey: "h100" },
  ]);
  assert.deepEqual(paths, ["/tx/서울-강남구"]);
});

test("같은 지역의 셀이 여러 개여도 지역 허브 경로는 하나다", () => {
  const paths = txPathsForChangedCells([
    { regionName: "서울 강남구", bandKind: "area", bandKey: "a60-85" },
    { regionName: "서울 강남구", bandKind: "area", bandKey: "a85-102" },
  ]);
  assert.equal(paths.filter((p) => p === "/tx/서울-강남구").length, 1);
});

/* ── 공개 임장노트 → 지역 페이지 ──────────────────────────────────────── */

test("노트 지역 판정은 화면(/region/[id])과 같은 규칙이다", () => {
  assert.equal(noteMatchesRegion("고양 덕양구 행신동", "고양시 덕양구"), true);
  assert.equal(noteMatchesRegion("강남구 대치동", "강남구"), true);
  assert.equal(noteMatchesRegion("", "강남구"), false);
});

test("공개 노트가 실리는 지역 페이지 id 를 고른다", () => {
  const ids = catalogIdsForNoteRegion("강남구 대치동");
  assert.ok(ids.includes("gangnam"), `gangnam 이 없다: ${ids.join(",")}`);
});

test("지역 텍스트가 비면 비울 지역이 없다", () => {
  assert.deepEqual(catalogIdsForNoteRegion("   "), []);
});

/* ── 월간 리포트 경로 ─────────────────────────────────────────────────── */

test("최근 완결 월만 만든다 — 이번 달은 아직 '월간' 사실이 아니다", () => {
  const months = recentReportMonths(3, new Date(2026, 8, 25)); // 2026-09-25
  assert.deepEqual(
    months.map((m) => m.ym),
    ["202608", "202607", "202606"],
  );
  assert.deepEqual(
    months.map((m) => m.slug),
    ["2026-08", "2026-07", "2026-06"],
  );
});

test("아카이브 시작점(2024-01) 이전 달은 만들지 않는다", () => {
  const months = recentReportMonths(6, new Date(2024, 2, 5)); // 2024-03
  assert.deepEqual(
    months.map((m) => m.ym),
    ["202402", "202401"],
  );
});

test("전국 리포트는 yyyymm, 지역 리포트는 yyyy-mm 형식이다", () => {
  const now = new Date(2026, 8, 25);
  assert.deepEqual(nationalReportPaths(2, now), ["/reports/202608", "/reports/202607"]);
  assert.deepEqual(regionReportPaths(["gangnam"], 2, now), [
    "/region/gangnam/report",
    "/region/gangnam/report/2026-08",
    "/region/gangnam/report/2026-07",
  ]);
});

test("빈 지역 id 는 경로를 만들지 않는다", () => {
  assert.deepEqual(regionReportPaths(["", "  "], 2, new Date(2026, 8, 25)), []);
});

/* ── REB 스냅샷 지문 ──────────────────────────────────────────────────── */

test("같은 값이면 지문도 같다 — 공표가 없는 날은 아무것도 비우지 않는다", () => {
  const row = { period: "202608", per_m2_sale: 30384497, avg_sale: null, trade_count: 120 };
  assert.equal(rebSnapshotFingerprint(row), rebSnapshotFingerprint({ ...row }));
});

test("화면에 실리는 값이 바뀌면 지문이 달라진다", () => {
  const a = rebSnapshotFingerprint({ period: "202608", per_m2_sale: 30384497 });
  const b = rebSnapshotFingerprint({ period: "202609", per_m2_sale: 30384497 });
  const c = rebSnapshotFingerprint({ period: "202608", per_m2_sale: 30500000 });
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

test("null 과 0 을 같은 값으로 접지 않는다", () => {
  assert.notEqual(
    rebSnapshotFingerprint({ jeonse_ratio: null }),
    rebSnapshotFingerprint({ jeonse_ratio: 0 }),
  );
});

test("지문 비교는 달라진 지역만 돌려준다", () => {
  const before = new Map([
    ["gangnam", "a"],
    ["songpa", "b"],
  ]);
  const after = new Map([
    ["gangnam", "a"],
    ["songpa", "b2"],
    ["mapo", "c"], // 새로 생긴 지역 — 지금까지 "통계 없음" 으로 굳어 있었다
  ]);
  assert.deepEqual(diffRegionFingerprints(before, after).sort(), ["mapo", "songpa"]);
});

test("바뀐 게 없으면 빈 배열 — 그날은 재생성 0 이다", () => {
  const m = new Map([["gangnam", "a"]]);
  assert.deepEqual(diffRegionFingerprints(m, new Map(m)), []);
});

/* ── 라우트 TTL 잠금 ──────────────────────────────────────────────────── */

test("TTL 을 올린 라우트가 되돌아가지 않는다(비움 배선과 짝이다)", async () => {
  const { readFile } = await import("node:fs/promises");
  const expected: Array<[string, string]> = [
    ["app/region/[id]/page.tsx", "604_800"],
    ["app/embed/region/[id]/page.tsx", "604_800"],
    ["app/region/[id]/report/page.tsx", "604_800"],
    ["app/region/[id]/report/[ym]/page.tsx", "604_800"],
    ["app/tx/page.tsx", "604_800"],
    ["app/tx/[region]/page.tsx", "604_800"],
    ["app/tx/[region]/[kind]/[band]/page.tsx", "604_800"],
    ["app/reports/[ym]/page.tsx", "604_800"],
    ["app/analysis/ai/r/[id]/page.tsx", "604_800"],
    ["app/analysis/page.tsx", "86_400"],
    ["app/analysis/accuracy/page.tsx", "86_400"],
    ["app/analysis/gap/page.tsx", "86_400"],
    ["app/analysis/price/page.tsx", "86_400"],
    ["app/analysis/scenario/page.tsx", "86_400"],
    ["app/analysis/timing/page.tsx", "86_400"],
    ["app/analysis/temperature/page.tsx", "86_400"],
    ["app/analysis/temperature/[region]/page.tsx", "86_400"],
    ["app/analysis/ai/[tool]/page.tsx", "86_400"],
    ["app/reports/page.tsx", "86_400"],
    ["app/reports/season/[slug]/page.tsx", "86_400"],
  ];
  for (const [file, value] of expected) {
    const src = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.ok(
      src.includes(`export const revalidate = ${value};`),
      `${file} 의 revalidate 가 ${value} 가 아니다`,
    );
  }
});

test("비움 배선이 크론에 남아 있다 — TTL 만 올리고 비움을 빼면 화면이 굳는다", async () => {
  const { readFile } = await import("node:fs/promises");
  const cases: Array<[string, string]> = [
    ["app/api/cron/reb-ingest/route.ts", "invalidateChangedMarketRegions"],
    ["app/api/cron/reb-ingest/route.ts", "invalidateRebChangedRegions"],
    ["app/api/cron/market-aggregates-refresh/route.ts", "invalidateChangedMarketRegions"],
    ["app/api/cron/market-temperature-snapshot/route.ts", "invalidateTemperatureRegions"],
    ["app/api/cron/supply-ingest/route.ts", "invalidateAllRegionPages"],
    ["app/api/inspection/notes/route.ts", "catalogIdsForNoteRegion"],
    ["app/api/inspection/notes/[id]/route.ts", "catalogIdsForNoteRegion"],
  ];
  for (const [file, marker] of cases) {
    const src = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.ok(src.includes(marker), `${file} 에 ${marker} 배선이 없다`);
  }
});
