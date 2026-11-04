import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readRecentMonths, POSTGREST_MAX_ROWS } from "@/lib/supabase/read-paged";
import {
  collectFreshGroups,
  freshGroupKey,
  isNewHigh,
  priorAreaRange,
  roundArea,
  utcYmMonthsAgo,
  type FreshTradeRow,
} from "@/lib/market/price-highs-core";

/* [1103] 운영 신뢰성 — Vercel 런타임 오류 다섯 묶음의 고침을 잠근다.
 *  ① /complex/[id] 곁다리 "한 번 더"(4/5 중단 판정 앞 · 실거래 성공 때만 · 차단기 존중 · 판정·던지기는 그대로)
 *  ② /town/news/tag/[tag] 20장이 한 벌을 나눠 읽는다(태그 캐시 · 본문 없는 열) · 운영 재검증 실패는 던져 직전 화면 유지
 *  ③ /region/[id] 전월세 표본 — 달별 · 정렬 없는 인덱스 읽기(readRecentMonths) · 예산 초과는 warn
 *  ④ 신고가 크론 · 주간 시황 — RPC detect_new_price_highs 대신 금액 순 상위 300묶음 앱 쪽 탐지
 *  ⑤ /sitemap.xml 인덱스 — optional 자식을 만들지 않는다(본문은 늘 같다) */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 검사하지 않는다(다른 테스트와 같은 방식) */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
const between = (src: string, a: string, b: string) => {
  const i = src.indexOf(a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(i >= 0 && j > i, `구간 ${a} … ${b}`);
  return src.slice(i, j);
};

/* ---------- ① 단지 화면 ---------- */
test("① 단지 — 곁다리 넷을 예산 받는 함수로 · 첫 파도는 예전 예산(5초)·같은 인자", () => {
  const view = between(strip(read("app/complex/[id]/page.tsx")), "async function loadView(", "function tradeDeltaViews(");
  assert.match(view, /posts: \(budget: Deadline\) =>\s*settle\(\s*`\$\{row\.name\} 단지 이야기`,\s*rowP\.then\(\(r\) => getComplexPosts\(\(r \?\? row\)\.canonical_id, 12, budget\.signal\)\),\s*budget\.expired,/);
  assert.match(view, /listings: \(budget: Deadline\) =>\s*settle\(\s*`\$\{row\.name\} 등록 매물`,\s*listApprovedListings\(\{ complexName: row\.name, signal: budget\.signal \}\),\s*budget\.expired,/);
  assert.match(view, /nearby: \(budget: Deadline\) =>[\s\S]*?loadNearbyRows\(row, emd, budget\.signal\)/);
  assert.match(view, /coord: \(budget: Deadline\) =>[\s\S]*?getCachedCoord\(dec\.region, dec\.name\)/);
  assert.match(
    view,
    /side\.posts\(budget\),\s*side\.nearby\(budget\),\s*side\.coord\(budget\),\s*side\.listings\(budget\),\s*\]\);/,
    "첫 파도는 공유 예산(budget)",
  );
  assert.match(read("app/complex/[id]/page.tsx"), /const SIDE_QUERY_BUDGET_MS = 5_000;/);
  assert.match(read("app/complex/[id]/page.tsx"), /const SIDE_RETRY_BUDGET_MS = 3_000;/);
});

test("① 단지 — '한 번 더'는 실거래 성공 · 4/5 이상 실패 · 차단기 꺼짐일 때만, 실패한 것만 새 예산으로 · 판정 앞", () => {
  const view = between(strip(read("app/complex/[id]/page.tsx")), "async function loadView(", "function tradeDeltaViews(");
  assert.match(
    view,
    /const sideRetried =\s*txR\.ok && firstSideFailures >= SIDE_FAILURE_ABORT_THRESHOLD && !shouldSkipRetry\(rowBreaker, Date\.now\(\)\);/,
  );
  assert.match(view, /const retry = startDeadline\(SIDE_RETRY_BUDGET_MS\);/);
  for (const k of ["posts", "nearby", "coord", "listings"]) {
    const v = k === "posts" ? "postsR" : k === "nearby" ? "sameDongR" : k === "coord" ? "coordR" : "listingsR";
    assert.ok(view.includes(`${v}.ok ? ${v} : side.${k}(retry)`), `${k} — 성공한 것은 다시 묻지 않는다`);
  }
  assert.match(view, /retry\.done\(\);/);
  /* 판정은 다시 물은 뒤 · 기준·던지는 뜻 그대로 */
  const retryAt = view.indexOf("if (sideRetried) {");
  const judgeAt = view.indexOf("const sideResults = [txR, postsR, sameDongR, coordR, listingsR];");
  const throwAt = view.indexOf("if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD)");
  assert.ok(retryAt > 0 && judgeAt > retryAt && throwAt > judgeAt, "한 번 더 → 판정 → 던지기 순서");
  assert.match(read("app/complex/[id]/page.tsx"), /const SIDE_FAILURE_ABORT_THRESHOLD = 4;/, "임계는 그대로 4/5");
  assert.ok(view.includes("빈 껍데기를 캐시에 남기지 않기 위해 렌더를 중단합니다"));
  /* 실거래 단독 실패도 그대로 던진다([1053]) */
  assert.ok(view.includes("if (!txR.ok) {\n    throw new Error("));
  /* 계측 줄에 첫 파도 실패·재시도 여부 */
  assert.match(view, /fail1=\$\{firstSideFailures\} retry=\$\{sideRetried \? 1 : 0\}/);
});

/* ---------- ② 뉴스 주제 허브 ---------- */
test("② 뉴스 주제 허브 — 20장이 한 벌(태그 캐시 · 화면 수명 이상)을 읽는다 · 본문 열 없음", () => {
  const page = strip(read("app/town/news/tag/[tag]/page.tsx"));
  assert.match(page, /import \{ readNewsTagHubPosts \} from "\.\/tag-posts";/);
  assert.match(page, /const all = await readNewsTagHubPosts\(\);/);
  assert.doesNotMatch(page, /readTownPosts\(/, "요청 단위로만 읽던 경로는 걷었다");
  const pageRevalidate = Number(/export const revalidate = ([0-9_]+);/.exec(page)![1].replace(/_/g, ""));

  const loader = strip(read("app/town/news/tag/[tag]/tag-posts.ts"));
  const m = /unstable_cache\([\s\S]*?\["news-tag-hub-posts-v1"\],\s*\{ revalidate: ([0-9_]+), tags: \[TOWN_POSTS_TAG\] \}/.exec(loader);
  assert.ok(m, "태그 town-posts 캐시");
  assert.ok(Number(m![1].replace(/_/g, "")) >= pageRevalidate, "화면 수명을 끌어내리지 않는다(check-isr-ttl 원칙)");
  assert.match(loader, /readNewsTagBoardPosts\(\)/);

  const bp = read("lib/newui/board-posts.ts");
  const sel = /const BOARD_SELECT_TAGHUB =\s*((?:"[^"]*"\s*\+?\s*)+);/.exec(bp);
  assert.ok(sel, "허브 전용 열");
  const cols = sel![1].replace(/"\s*\+\s*"/g, "").replace(/"/g, "").split(",").map((c) => c.trim());
  for (const c of ["id", "title", "category", "tags", "source_name", "source_published_at", "external_key", "is_automated", "automation_meta", "created_at"]) {
    assert.ok(cols.includes(c), `허브가 쓰는 열 ${c}`);
  }
  assert.ok(!cols.includes("content") && !cols.includes("*"), "본문(content)은 읽지 않는다");
  assert.match(strip(bp), /kind === "taghub" \? BOARD_SELECT_TAGHUB/);
  assert.match(strip(bp), /export function readNewsTagBoardPosts\(\): Promise<Post\[\]> \{\s*return mergeTownPosts\(loadBoardPosts\(BOARD_POSTS_LIMIT, "taghub"\)\);/);
  /* 단지 화면 · 뉴스 상세 번들에 들어가는 모듈에는 새 (태그) 캐시를 두지 않는다 — check-isr-ttl NO_GLOBAL_TAGS */
  assert.equal((strip(bp).match(/unstable_cache\(/g) ?? []).length, 2, "board-posts 의 캐시는 예전 둘 그대로");
});

test("② 뉴스 주제 허브 — 운영 재검증 중 실패는 던져 직전 화면을 둔다 · 빌드 중에만 실패 화면", () => {
  const page = strip(read("app/town/news/tag/[tag]/page.tsx"));
  assert.match(page, /const IS_BUILD_PHASE = process\.env\.NEXT_PHASE === "phase-production-build";/);
  const c = between(page, "} catch (e) {", "const byId =");
  assert.match(c, /if \(!IS_BUILD_PHASE\) \{[\s\S]*?throw e;\s*\}/);
  assert.ok(c.indexOf("throw e;") < c.indexOf("failed = true;"), "실패 화면은 빌드 경로에서만");
});

/* ---------- ③ 지역 화면 전월세 표본 ---------- */
test("③ readRecentMonths — 달마다 한 쪽 · 정렬 없이 · 나란히 / 최신 달만 gte / 꽉 찬 달만 정렬 쪽 나누기 / 상한·실패", async () => {
  const calls: Array<{ ym: string; newest: boolean; ordered: boolean; from: number; to: number }> = [];
  const sizes: Record<string, number> = { "202611": 120, "202610": 984, "202609": 997 };
  const r = await readRecentMonths<number>(["202611", "202610", "202609"], async (ym, o, from, to) => {
    calls.push({ ym, ...o, from, to });
    const n = Math.max(0, Math.min(sizes[ym] - from, to - from + 1));
    return { data: Array.from({ length: n }, (_, i) => from + i), error: null };
  }, 4000);
  assert.equal(r.rows.length, 120 + 984 + 997);
  assert.equal(r.truncated, false);
  assert.deepEqual(calls.map((c) => [c.ym, c.newest, c.ordered, c.from, c.to]), [
    ["202611", true, false, 0, POSTGREST_MAX_ROWS - 1],
    ["202610", false, false, 0, POSTGREST_MAX_ROWS - 1],
    ["202609", false, false, 0, POSTGREST_MAX_ROWS - 1],
  ], "1,000행 미만 달은 정렬 없는 한 번");

  /* 큰 달(동탄 2026.09 1,686행)은 그 달만 정렬 쪽 나누기 */
  const calls2: Array<{ ym: string; ordered: boolean; from: number }> = [];
  const big: Record<string, number> = { "202611": 50, "202610": 1293, "202609": 1686 };
  const r2 = await readRecentMonths<string>(["202611", "202610", "202609"], async (ym, o, from, to) => {
    calls2.push({ ym, ordered: o.ordered, from });
    const n = Math.max(0, Math.min(big[ym] - from, to - from + 1));
    return { data: Array.from({ length: n }, (_, i) => `${ym}:${from + i}`), error: null };
  }, 4000);
  assert.equal(r2.rows.length, 50 + 1293 + 1686, "빠짐없이");
  assert.equal(new Set(r2.rows).size, r2.rows.length, "겹침 없이");
  assert.equal(r2.truncated, false);
  /* 달들은 나란히 돌아 호출 순서가 섞인다 — 달별로 본다 */
  const orderedOf = (ym: string) => calls2.filter((c) => c.ordered && c.ym === ym).map((c) => c.from);
  assert.deepEqual(orderedOf("202611"), [], "작은 달은 정렬 쪽 나누기 없음");
  assert.deepEqual(orderedOf("202610"), [0, 1000]);
  assert.deepEqual(orderedOf("202609"), [0, 1000]);
  assert.ok(r2.rows[0].startsWith("202611") && r2.rows[r2.rows.length - 1].startsWith("202609"), "최신 달부터");

  /* 상한 — 최신 달부터 남기고 truncated */
  const r3 = await readRecentMonths<string>(["a", "b"], async (ym, _o, from, to) => {
    const n = Math.max(0, Math.min(800 - from, to - from + 1));
    return { data: Array.from({ length: n }, (_, i) => `${ym}${from + i}`), error: null };
  }, 1000);
  assert.equal(r3.rows.length, 1000);
  assert.equal(r3.truncated, true);
  assert.equal(r3.rows.filter((x) => x.startsWith("a")).length, 800);

  await assert.rejects(
    readRecentMonths(["x"], async () => ({ data: null, error: { message: "boom" } }), 10),
    /boom/,
    "실패는 던진다(빈 배열로 위장하지 않는다)",
  );
});

test("③ 전월세 스냅샷 — readRecentMonths(이번 달 · 전달 · from3) · 정렬은 꽉 찬 달에서만 · 예산 초과는 warn", () => {
  const rent = strip(read("lib/market/rent.ts"));
  assert.match(rent, /readRecentMonths<Record<string, unknown>>\(\[ymMonthsAgo\(0\), ymMonthsAgo\(1\), from3\]/);
  assert.match(rent, /q = newest \? q\.gte\("contract_ym", ym\) : q\.eq\("contract_ym", ym\);/);
  assert.match(rent, /if \(ordered\) q = q\.order\("contract_ym", \{ ascending: false \}\)\.order\("id", \{ ascending: true \}\);/);
  assert.doesNotMatch(rent, /readPaged</, "3개월 정렬 쪽 나누기는 걷었다");
  assert.match(rent, /if \(signal\?\.aborted\) logger\.warn\(/);
  const region = strip(read("app/region/[id]/page.tsx"));
  assert.match(region, /if \(budget\.signal\.aborted\) logger\.warn\(`\[\/region\/\$\{id\}\] 전월세 스냅샷 예산 초과로 접음/);
  assert.match(region, /else logger\.error\(`\[\/region\/\$\{id\}\] 전월세 스냅샷 조회 실패 — 섹션 생략:`, msg\);/);
});

/* ---------- ④ 신고가 탐지 ---------- */
test("④ 신고가 순수 규칙 — 묶음 최고가 · 금액 순 · 쪽을 넘어 중복 없음 · 면적 구간 · 3% 경계 · 달 계산", () => {
  const row = (complex: string, area: number, deal: number, ym = "202611"): FreshTradeRow => ({
    complex_name: complex,
    region_name: "서울 송파구",
    area_m2: area,
    deal_amount_krw: deal,
    contract_ym: ym,
    contract_day: 1,
  });
  const seen = new Set<string>();
  const g1 = collectFreshGroups([row("A", 84.97, 30e8), row("A", 84.6, 31e8), row("B", 59.9, 12e8), row("A", 59.4, 20e8)], seen);
  assert.deepEqual(g1.map((g) => [g.complex_name, g.area, g.deal_amount_krw]), [
    ["A", 85, 31e8],
    ["A", 59, 20e8],
    ["B", 60, 12e8],
  ]);
  /* 다음 쪽의 같은 묶음(더 싼 값)은 다시 나오지 않는다 */
  const g2 = collectFreshGroups([row("A", 85.2, 29e8), row("C", 84, 9e8)], seen);
  assert.deepEqual(g2.map((g) => g.complex_name), ["C"]);
  assert.equal(freshGroupKey({ complex_name: "A", region_name: "R", area: 85 }), "A\u0001R\u000185");

  /* round(area)::int between a-2 and a+2  ⇔  area ∈ [a-2.5, a+2.5) */
  const { gte, lt } = priorAreaRange(84);
  for (let x = 80; x <= 88; x += 0.05) {
    const inSql = roundArea(x) >= 82 && roundArea(x) <= 86;
    assert.equal(x >= gte && x < lt, inSql, `area ${x.toFixed(2)}`);
  }
  assert.equal(roundArea(84.5), 85, "Postgres round 와 같은 .5 올림");

  /* deal > prior_max * 1.03 — 정확히 3% 는 아니다, 1원 넘으면 맞다 · 표본 10건 미만은 아니다 */
  assert.equal(isNewHigh(1_030_000_000, { max: 1_000_000_000, n: 10 }, 10, 1.03), false);
  assert.equal(isNewHigh(1_030_000_001, { max: 1_000_000_000, n: 10 }, 10, 1.03), true);
  assert.equal(isNewHigh(5_000_000_000, { max: 1_000_000_000, n: 9 }, 10, 1.03), false);
  assert.equal(isNewHigh(5_000_000_000, { max: null, n: 30 }, 10, 1.03), false);
  assert.equal(isNewHigh(30_900_000_000, { max: 30_000_000_000, n: 12 }, 10, 1.03), false, "큰 금액도 정확(300억 × 1.03)");

  /* to_char(now() - interval '1 month','YYYYMM') */
  assert.equal(utcYmMonthsAgo(1, new Date("2026-11-03T13:00:00Z")), "202610");
  assert.equal(utcYmMonthsAgo(1, new Date("2026-01-15T00:00:00Z")), "202512");
  assert.equal(utcYmMonthsAgo(1, new Date("2026-03-31T12:00:00Z")), "202602");
});

test("④ 신고가 크론 · 주간 시황 — RPC 를 부르지 않는다 · 같은 인자 · 묶음 질의는 부분 인덱스 꼴 · 키셋 · 상한 300", () => {
  const watch = strip(read("lib/market/price-record-watch.ts"));
  const weekly = strip(read("lib/market/weekly-highs.ts"));
  for (const [f, src] of [["price-record-watch", watch], ["weekly-highs", weekly]] as const) {
    assert.doesNotMatch(src, /rpc\("detect_new_price_highs"/, `${f}: RPC 걷음`);
  }
  assert.match(watch, /detectNewPriceHighs\(\{ hours: 26, minPrior: 10, margin: 1\.03, limit: 5 \}\)/);
  assert.match(weekly, /detectNewPriceHighs\(\{ hours: 168, minPrior: 10, margin: 1\.03, limit \}\)/);
  const ph = strip(read("lib/market/price-highs.ts"));
  assert.match(ph, /^import "server-only";/m);
  assert.match(ph, /export const FRESH_CANDIDATE_CAP = 300;/);
  /* 앞선 이력 — cov2 부분 인덱스 술어와 같은 꼴(coalesce 금지) · 개수 정확 · 최고가 1행 */
  const prior = between(ph, "async function readPrior(", "export async function detectNewPriceHighs(");
  assert.match(prior, /\.select\("deal_amount_krw", \{ count: "exact" \}\)/);
  assert.match(prior, /\.eq\("is_cancelled", false\)/);
  assert.doesNotMatch(ph, /coalesce/);
  assert.match(prior, /\.gte\("contract_ym", ymFloor\)\s*\.lt\("contract_ym", g\.contract_ym\)\s*\.gte\("area_m2", area\.gte\)\s*\.lt\("area_m2", area\.lt\)/);
  assert.match(prior, /\.order\("deal_amount_krw", \{ ascending: false, nullsFirst: false \}\)\s*\.limit\(1\)/);
  /* 새 매매 — 금액 내림차순 키셋 */
  assert.match(ph, /q\.or\(`deal_amount_krw\.lt\.\$\{cursor\.deal\},and\(deal_amount_krw\.eq\.\$\{cursor\.deal\},id\.gt\.\$\{cursor\.id\}\)`\)/);
  assert.match(ph, /\.order\("deal_amount_krw", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  /* 금액 순으로 보다가 limit 건이 차면 멈춘다 */
  assert.match(ph, /for \(let i = 0; i < candidates\.length && out\.length < limit; i \+= PRIOR_CONCURRENCY\)/);
});

/* ---------- ⑤ 사이트맵 인덱스 ---------- */
test("⑤ 사이트맵 인덱스 — 자식을 만들지 않는다(본문은 늘 같다) · 늘 캐시 · 순서·indexed 필터 그대로", () => {
  const s = strip(read("lib/seo/sitemap-sections.ts"));
  const idx = between(s, "export async function buildSitemapIndex(", "export function sitemapSectionRoute(");
  assert.doesNotMatch(idx, /\.load\(/, "판정 조회 없음");
  assert.doesNotMatch(idx, /withBudget/);
  assert.match(idx, /SITEMAP_SECTIONS\.filter\(\(s\) => s\.indexed !== false\)\.map\(\(s\) => sitemapSectionPath\(s\.slug\)\)/);
  assert.match(idx, /return \{ xml: serializeSitemapIndex\(paths\), cacheable: true \};/);
  assert.doesNotMatch(s, /INDEX_PROBE_BUDGET_MS/);
  /* 자식 라우트의 실패 신호(503 + no-store)는 그대로 */
  const child = between(s, "export function sitemapSectionRoute(", "\n}\n");
  assert.ok((child.match(/status: 503/g) ?? []).length >= 3);
});

/* ---------- DB 제안 ---------- */
test("DB 제안 파일 — 적용하지 않은 제안으로 남긴다(근거 수치 포함)", () => {
  const p = "docs/ops-1103-db-proposals.sql";
  assert.ok(existsSync(path.join(ROOT, p)));
  const sql = read(p);
  assert.ok(sql.includes("적용하지 않았다"));
  assert.ok(sql.includes("mt_trade_complex_cov2_idx"));
  assert.match(sql, /490\.4 ms/);
});
