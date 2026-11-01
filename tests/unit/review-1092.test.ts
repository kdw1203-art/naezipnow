/* [1092] 소유자 2026-10-25 "배포는 11/1 · 추가로 대규모 최적화도 진행해줘" — 운영은 여전히 정지(503).
 *  비용: 서버 컴포넌트로 그린 긴 표 · 칸은 HTML 과 RSC(인라인 + .rsc) 양쪽에 원소 트리 그대로 실린다(동 화면 318KB 중 RSC 163KB ·
 *  /tx 허브 498KB 중 RSC 251KB). 클라이언트 조각이 압축 행으로 그리면 RSC 에는 props 만 남는다 — 동 화면 단지 표 · 구간 화면 단지 표 ·
 *  /tx 지역 칸 · 입주 물량 행(키 이름 45%). 그리고 남은 허브 13곳의 loading.tsx 셸 두 벌(1090 과 같은 현상)을 레이아웃 한 벌로.
 *  화면: 구간 화면 표 첫 열 고정 · 개발물건 로딩 머리가 본문과 달랐던 것(보통 벌 + 제목 vs 넓은 벌) 통일. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fromSupplyWire, toSupplyWire } from "../../lib/market/supply-wire";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

/* ── 긴 표 · 칸 → 클라이언트 조각(압축 행) ───────────────────────────────── */

test("동 화면 단지 표 — 서버는 압축 행만 넘기고 DongComplexTable(클라이언트)이 그린다 · 첫 열 고정 두 표 · 클라이언트 안전 모듈만", () => {
  const page = strip(read("app/dong/[region]/[dong]/page.tsx"));
  assert.match(page, /<DongComplexTable region=\{region\} rows=\{shown\.map\(toWire\(region\)\)\} rest=\{rest\.map\(toWire\(region\)\)\} \/>/);
  assert.doesNotMatch(page, /function ComplexRow\(/, "서버 쪽 행 렌더러는 없다");
  assert.match(page, /if \(c\.region !== pageRegion\) w\.push\(c\.region\);/, "지역은 화면 지역과 다를 때만 싣는다");
  const t = read("app/dong/[region]/[dong]/DongComplexTable.tsx");
  assert.match(t, /^"use client";/);
  assert.match(t, /export type DongComplexWire = \[string, number \| null, number \| null, number, number, number \| null, number \| null, string\?\];/);
  assert.match(t, /complexHrefFromNames\(rowRegion \?\? region, name\)/);
  assert.equal((t.match(/stickyFirst>/g) ?? []).length, 2);
  assert.doesNotMatch(strip(t), /complex-store|server-only|supabase/, "클라이언트 안전 모듈만(lib/seo/complex-slug · lib/market/format)");
});

test("구간 화면 단지 표 — BandComplexTable(클라이언트 · 압축 행) · 첫 열 고정 · 같은 셀 마크업", () => {
  const page = strip(read("app/tx/[region]/[kind]/[band]/page.tsx"));
  assert.match(page, /<BandComplexTable\s+region=\{region\.name\}\s+rows=\{complexes\.map\(\(c\) => \[c\.name, c\.avgAreaM2, c\.avgKrw, c\.minKrw, c\.maxKrw, c\.txCount, c\.latestYm\] as BandComplexWire\)\}\s*\/>/);
  assert.doesNotMatch(page, /<HScroll/);
  const t = read("app/tx/[region]/[kind]/[band]/BandComplexTable.tsx");
  assert.match(t, /^"use client";/);
  assert.match(t, /<HScroll className="lq-panel mt-3 max-md:mt-2" stickyFirst>/);
  assert.match(t, /\{formatKrwShort\(minKrw\)\}~\{formatKrwShort\(maxKrw\)\}/);
  assert.doesNotMatch(strip(t), /complex-store|server-only|supabase/);
});

test("/tx 허브 지역 칸 — TxRegionGroups(클라이언트 · [슬러그, 이름, 건수, 구간 수]) · 시/도 details 접힘 그대로", () => {
  const page = strip(read("app/tx/page.tsx"));
  assert.match(page, /<TxRegionGroups\s+maxTx=\{regions\.reduce\(\(m, r\) => Math\.max\(m, r\.txCount\), 0\)\}/);
  assert.match(page, /\[r\.slug, r\.name, r\.txCount, r\.areaCells\.length \+ r\.priceCells\.length\]/);
  assert.doesNotMatch(page, /g\.items\.map\(\(r\) =>/, "칸 마크업은 서버 쪽에 없다");
  const t = read("app/tx/TxRegionGroups.tsx");
  assert.match(t, /^"use client";/);
  assert.match(t, /<details key=\{sido\} open=\{gi === 0\}/);
  assert.match(t, /href=\{`\/tx\/\$\{encodeURIComponent\(slug\)\}`\}/);
  assert.match(t, /flex min-w-0 items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-0\.5/, "1074 칸 높이 규칙 그대로");
});

test("입주 물량 — 압축 행 왕복(toSupplyWire → fromSupplyWire) · 바이트 절반 아래 · page → SupplyClient 배선", () => {
  const items = [
    { moveInYm: "202601", region: "강원", bizType: "분양", address: "강원도 고성군 토성면 아야진리 산21번지 외 44필지", aptName: "아야진 라메르 데시앙", households: 811 },
    { moveInYm: "202712", region: "서울", bizType: null, address: null, aptName: "미정", households: null },
  ];
  const wire = toSupplyWire(items);
  assert.deepEqual(fromSupplyWire(wire), items);
  assert.deepEqual(wire[1], ["202712", "서울", null, null, "미정", null]);
  assert.ok(JSON.stringify(wire).length < JSON.stringify(items).length * 0.75, "키 이름이 빠진 만큼");
  assert.match(strip(read("app/supply/page.tsx")), /itemsWire=\{toSupplyWire\(all\.items\)\}/);
  const client = strip(read("app/supply/SupplyClient.tsx"));
  assert.match(client, /const items = useMemo\(\(\) => fromSupplyWire\(itemsWire\), \[itemsWire\]\);/);
  assert.match(client, /from "@\/lib\/market\/supply-wire"/);
  assert.doesNotMatch(strip(read("lib/market/supply-wire.ts")), /server-only|supabase/);
});

/* ── 남은 허브 셸 두 벌 → 레이아웃 한 벌 ────────────────────────────────── */

test("허브 13곳 — 셸은 layout 한 벌 · page 는 안쪽만 · (index) 그룹으로 옮긴 곳은 옛 자리에 파일이 없다", () => {
  const LAYOUTS: [string, RegExp, string[]][] = [
    ["app/supply/layout.tsx", /<PageShell breadcrumb=\{townBreadcrumb\("\/supply"\)\} wide>/, ["app/supply/page.tsx"]],
    ["app/auctions/layout.tsx", /<PageShell breadcrumb=\{townBreadcrumb\("\/auctions"\)\} wide>/, ["app/auctions/page.tsx"]],
    ["app/redevelopment/(index)/layout.tsx", /<PageShell breadcrumb=\{townBreadcrumb\("\/redevelopment"\)\} wide>/, ["app/redevelopment/(index)/page.tsx"]],
    ["app/apply/(index)/layout.tsx", /<PageShell breadcrumb=\{townBreadcrumb\("\/apply"\)\} wide>/, ["app/apply/(index)/page.tsx"]],
    ["app/dev-deals/(index)/layout.tsx", /<PageShell breadcrumb="동네이야기 › 개발물건 중개" wide>/, ["app/dev-deals/(index)/page.tsx"]],
    ["app/reports/(index)/layout.tsx", /<PageShell breadcrumb="월간 실거래 리포트">/, ["app/reports/(index)/page.tsx"]],
    ["app/digest/(index)/layout.tsx", /<PageShell breadcrumb="뉴스룸 › 주간 다이제스트">/, ["app/digest/(index)/page.tsx"]],
    ["app/imjang/(index)/layout.tsx", /<PageShell breadcrumb="홈 › 임장 가이드" title="임장 가이드">/, ["app/imjang/(index)/page.tsx"]],
    ["app/search/layout.tsx", /<PageShell title="통합 검색" breadcrumb="검색">/, ["app/search/page.tsx"]],
    ["app/rent/[region]/layout.tsx", /return <PageShell wide>\{children\}<\/PageShell>;/, ["app/rent/[region]/page.tsx"]],
    ["app/listings/layout.tsx", /return <PageShell>\{children\}<\/PageShell>;/, ["app/listings/page.tsx", "app/listings/new/page.tsx", "app/listings/[id]/page.tsx", "app/listings/compare/page.tsx"]],
    ["app/my/(index)/layout.tsx", /return <PageShell>\{children\}<\/PageShell>;/, ["app/my/(index)/page.tsx"]],
    ["app/notes/[id]/(index)/layout.tsx", /return <PageShell>\{children\}<\/PageShell>;/, ["app/notes/[id]/(index)/page.tsx"]],
  ];
  for (const [layout, re, inner] of LAYOUTS) {
    assert.match(read(layout), re, layout);
    for (const f of inner) assert.doesNotMatch(strip(read(f)), /<PageShell|<\/PageShell>|\{ PageShell \}/, `${f}: 셸은 레이아웃에만`);
  }
  /* 옛 자리 — 같은 주소에 두 쪽이 되거나 조상 loading 이 셸을 다시 그리면 안 된다 */
  for (const gone of ["app/apply/page.tsx", "app/dev-deals/page.tsx", "app/my/page.tsx", "app/notes/[id]/page.tsx"]) {
    assert.equal(existsSync(gone), false, gone);
  }
  /* 404 판정 레이아웃(1066)은 그 위에 그대로 */
  assert.match(read("app/notes/[id]/layout.tsx"), /notFound\(\)/);
  assert.match(read("app/rent/[region]/layout.tsx"), /notFound\(\)/);
  /* 경로 줄 · 제목은 화면이 ShellBreadcrumb · ShellTitle 로 */
  assert.match(strip(read("app/listings/page.tsx")), /<ShellBreadcrumb>홈 › 실매물<\/ShellBreadcrumb>/);
  assert.match(strip(read("app/listings/new/page.tsx")), /<ShellBreadcrumb>실매물 › 매물 등록<\/ShellBreadcrumb><ShellTitle>매물 등록<\/ShellTitle>/);
  assert.match(strip(read("app/my/(index)/page.tsx")), /<ShellBreadcrumb>마이<\/ShellBreadcrumb>/);
  assert.match(strip(read("app/my/(index)/page.tsx")), /<ShellTitle>마이<\/ShellTitle>/);
  assert.match(strip(read("app/notes/[id]/(index)/page.tsx")), /<ShellBreadcrumb>\{v\.breadcrumb\}<\/ShellBreadcrumb>/);
  /* 오류 화면 — 셸 안이라 main 을 겹치지 않는다 */
  assert.match(strip(read("app/rent/[region]/error.tsx")), /inShell/);
  /* [1093] 공개 허브의 loading.tsx 는 없다(본문이 숨은 조각으로 저장되지 않게 · review-1093) — 레이아웃 한 벌은 그대로 */
});
