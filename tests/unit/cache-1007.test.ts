import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEFAULT_SAMPLE_WINDOW_MS,
  SAMPLE_TABLE_MAX_KEYS,
  decideSample,
  pruneSampleTable,
  sampleWithTable,
  suppressedSuffix,
  type SampleEntry,
} from "../../lib/log/sample";
import { shouldSkipBuild } from "../../scripts/vercel-ignore.mjs";

/* [1007] 서버 캐시·ISR TTL·로그 샘플링·빌드 생략 판정 — 순수 부분만 여기서 고정한다.
   (unstable_cache/revalidatePath 는 next 런타임이 필요해 단위 테스트 밖 — 소스 규칙은 아래 텍스트 검사.) */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/* ── 로그 샘플링(lib/log/sample.ts) ──────────────────────────────────────── */

test("decideSample — 첫 발생은 반드시 찍고 창 안 반복은 센다", () => {
  const t0 = 1_000_000;
  const first = decideSample(undefined, t0);
  assert.equal(first.emit, true, "첫 발생은 찍힌다");
  assert.equal(first.suppressedBefore, 0);
  assert.deepEqual(first.next, { windowStart: t0, suppressed: 0 });

  const second = decideSample(first.next, t0 + 1_000);
  assert.equal(second.emit, false, "같은 창 안 두 번째는 생략");
  assert.equal(second.next.suppressed, 1);
  const third = decideSample(second.next, t0 + 59_999);
  assert.equal(third.emit, false);
  assert.equal(third.next.suppressed, 2);
});

test("decideSample — 다음 창의 첫 발생은 직전 창의 생략 건수를 들고 나간다", () => {
  const t0 = 5_000;
  let st: SampleEntry | undefined;
  for (let i = 0; i < 300; i++) st = decideSample(st, t0 + i * 10).next;
  const next = decideSample(st, t0 + DEFAULT_SAMPLE_WINDOW_MS);
  assert.equal(next.emit, true, "창이 바뀌면 다시 찍는다");
  assert.equal(next.suppressedBefore, 299, "300건 중 첫 건만 찍혔으니 299건 생략");
  assert.deepEqual(next.next, { windowStart: t0 + DEFAULT_SAMPLE_WINDOW_MS, suppressed: 0 });
});

test("decideSample — 창 길이 인자·시계 역행", () => {
  const a = decideSample(undefined, 100, 10);
  assert.equal(decideSample(a.next, 109, 10).emit, false);
  assert.equal(decideSample(a.next, 110, 10).emit, true, "창(10ms) 경계에서 다시 찍는다");
  const back = decideSample({ windowStart: 1_000, suppressed: 4 }, 500, 10);
  assert.equal(back.emit, true, "시계가 뒤로 가면 새 창으로 본다(영원히 침묵하지 않는다)");
  assert.equal(back.suppressedBefore, 4);
});

test("suppressedSuffix — 0 이면 빈 문자열, 아니면 생략 건수와 창 길이(초)", () => {
  assert.equal(suppressedSuffix(0), "");
  assert.equal(suppressedSuffix(12), " (이전 60초 동안 같은 로그 12회 생략)");
  assert.equal(suppressedSuffix(3, 10_000), " (이전 10초 동안 같은 로그 3회 생략)");
});

test("sampleWithTable — 키별로 따로 세고, 상한을 넘으면 오래된 키부터 비운다", () => {
  const table = new Map<string, SampleEntry>();
  const t0 = 0;
  assert.equal(sampleWithTable(table, "a", t0).emit, true);
  assert.equal(sampleWithTable(table, "b", t0).emit, true, "다른 키는 독립");
  assert.equal(sampleWithTable(table, "a", t0 + 1).emit, false);
  assert.equal(sampleWithTable(table, "a", t0 + 2).emit, false);
  const again = sampleWithTable(table, "a", t0 + DEFAULT_SAMPLE_WINDOW_MS);
  assert.equal(again.emit, true);
  assert.equal(again.suffix, " (이전 60초 동안 같은 로그 2회 생략)");
  assert.equal(sampleWithTable(table, "b", t0 + DEFAULT_SAMPLE_WINDOW_MS).suffix, "", "b 는 생략이 없었다");

  /* 상한 — 키가 무한히 늘지 않는다 */
  for (let i = 0; i < SAMPLE_TABLE_MAX_KEYS + 50; i++) sampleWithTable(table, `k${i}`, t0 + 10);
  assert.ok(table.size <= SAMPLE_TABLE_MAX_KEYS, `표 크기 ${table.size} ≤ ${SAMPLE_TABLE_MAX_KEYS}`);
  assert.equal(table.has("a"), false, "가장 오래 안 쓴 키(a)부터 빠졌다");
  assert.equal(table.has(`k${SAMPLE_TABLE_MAX_KEYS + 49}`), true, "가장 최근 키는 남는다");

  const t2 = new Map<string, SampleEntry>([["x", { windowStart: 0, suppressed: 0 }]]);
  pruneSampleTable(t2, 5);
  assert.equal(t2.size, 1, "상한 아래면 손대지 않는다");
});

/* ── Vercel 빌드 생략 판정(scripts/vercel-ignore.mjs) ─────────────────────── */

test("shouldSkipBuild — dependabot 브랜치는 생략, 정보 부족은 빌드", () => {
  assert.equal(shouldSkipBuild({ ref: "dependabot/npm_and_yarn/next-15.5.21", changedFiles: ["package.json"] }).skip, true);
  assert.equal(shouldSkipBuild({ ref: "main", changedFiles: null }).skip, false, "목록을 모르면 빌드");
  assert.equal(shouldSkipBuild({ ref: "main", changedFiles: [] }).skip, false, "0개(비교 실패 가능)도 빌드");
  assert.equal(shouldSkipBuild({ ref: null, changedFiles: undefined }).skip, false);
});

test("shouldSkipBuild — 문서·테스트·CI 설정만 바뀐 커밋은 생략, 코드가 하나라도 섞이면 빌드", () => {
  const docsOnly = ["docs/release-1007.md", "README.md", "tests/unit/cache-1007.test.ts", ".github/workflows/etl.yml", "LICENSE"];
  const v = shouldSkipBuild({ ref: "main", changedFiles: docsOnly });
  assert.equal(v.skip, true, v.reason);
  const mixed = shouldSkipBuild({ ref: "main", changedFiles: [...docsOnly, "lib/log.ts"] });
  assert.equal(mixed.skip, false, mixed.reason);
  assert.match(mixed.reason, /lib\/log\.ts/);
  /* 산출물에 들어가는 것들은 .md 가 아니면 전부 빌드 */
  for (const f of ["app/page.tsx", "vercel.json", "next.config.ts", "package-lock.json", "public/robots.txt", "supabase/migrations/x.sql", "scripts/vercel-ignore.mjs"]) {
    assert.equal(shouldSkipBuild({ ref: "main", changedFiles: [f] }).skip, false, f);
  }
  /* 경로 어딘가의 .md 는 문서다 — 하지만 "md" 로 끝나는 코드 파일명은 아니다 */
  assert.equal(shouldSkipBuild({ ref: "main", changedFiles: ["lib/foo/NOTES.md"] }).skip, true);
  assert.equal(shouldSkipBuild({ ref: "main", changedFiles: ["lib/foo/cmd.ts"] }).skip, false);
});

/* ── 소스 규칙 — ISR TTL·데이터 캐시 TTL·크론 등록(텍스트 검사) ───────────── */

/* [1010] 값이 올라갔다(6시간 → 1일·7일). 근거와 각 경로의 비움 지점은
   tests/unit/town-1010.test.ts 가 표로 잠근다 — 여기는 1007 이 세운 "시간이 아니라 무효화가
   신선도를 맡는다" 는 골격이 그대로인지만 본다. */
test("동네 ISR TTL — /town 1일, 뉴스룸 1일, 뉴스·이야기 상세·동네 홈 7일", () => {
  assert.match(read("app/town/page.tsx"), /export const revalidate = 86_400;/);
  assert.match(read("app/town/news/page.tsx"), /export const revalidate = 86_400;/);
  for (const p of ["app/town/news/[id]/page.tsx", "app/town/story/[id]/page.tsx", "app/town/[region]/page.tsx"]) {
    assert.match(read(p), /export const revalidate = 604_800;/, p);
  }
});

test("TTL 을 늘린 자리에는 즉시 재검증이 배선돼 있다", () => {
  const inv = read("lib/cache/invalidate.ts");
  assert.match(inv, /export function invalidateTownFeed/);
  assert.match(inv, /export function invalidateHomeData/);
  assert.match(inv, /revalidatePath\(TOWN_REGION_ROUTE, "page"\)/, "동네 홈 62곳은 page 타입으로 한 번에");
  /* 이웃 글·댓글·공감·채택 → 피드/동네 홈 */
  for (const p of [
    "app/api/community/posts/route.ts",
    "app/api/community/posts/[id]/like/route.ts",
    "app/api/community/posts/[id]/comments/route.ts",
    "app/api/community/posts/[id]/comments/adopt/route.ts",
  ]) {
    assert.match(read(p), /invalidateTownFeed\(\)/, p);
  }
  /* 공개 노트 생성·공개 전환·삭제 → 피드/동네 홈 + 홈 스냅샷 태그 */
  for (const p of ["app/api/inspection/notes/route.ts", "app/api/inspection/notes/[id]/route.ts"]) {
    assert.match(read(p), /invalidateTownFeed\(\)/, p);
    assert.match(read(p), /invalidateHomeData\(\)/, p);
  }
  /* 뉴스 성격의 글을 싣는 크론 3곳 + 외부 적재를 잇는 재검증 크론 */
  for (const p of [
    "app/api/cron/weekly-market-post/route.ts",
    "app/api/cron/region-intro-posts/route.ts",
    "app/api/cron/price-record-watch/route.ts",
    "app/api/cron/news-revalidate/route.ts",
  ]) {
    assert.match(read(p), /invalidateAfterIngest\("news"\)/, p);
  }
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
  const cron = vercel.crons.find((c) => c.path === "/api/cron/news-revalidate");
  assert.ok(cron, "vercel.json 에 news-revalidate 크론");
  assert.equal(cron!.schedule, "40 23,1,5 * * *", "08:40·10:40·14:40 KST");
});

test("데이터 캐시 TTL — home-data 600초(태그 home-data), 단지 축은 허브 렌더에서 비영속", () => {
  /* [1010] 동네 축 데이터 캐시(related-town-posts-v1 · newui-weekly-digest-v2)의 값은
     tests/unit/town-1010.test.ts 로 옮겨 잠갔다 — 그 값들이 라우트 revalidate 를 끌어내리고
     있었기 때문에 라우트 표와 같은 자리에서 봐야 한다. */
  const home = read("lib/landing/data.ts");
  assert.match(home, /\["home-data-v1"\], \{\s*revalidate: 600,\s*tags: \["home-data"\]/);
  const loaders = read("app/complex/[id]/section-loaders.ts");
  assert.match(loaders, /complexDurable: false/);
  const live = read("lib/ai/live-context.ts");
  assert.match(live, /const loadComplexAxesPerRequest = cache\(loadComplexAxes\)/);
  /* 노트 id 별 항목은 데이터 캐시에서 빠졌고, 공용 풀만 남았다 */
  const notes = read("lib/inspection/note-cache.ts");
  assert.doesNotMatch(notes, /note-public-row-v1|note-public-visits-v1|note-public-comments-v1/);
  assert.match(notes, /\["related-notes-pool-v1"\]/);
});

test("OG 이미지 라우트 전부 CDN 캐시 헤더를 싣는다", () => {
  /* [1010] 헤더 문자열을 lib/og/cache.ts 상수 둘로 모았다(그 파일에 "왜 이 값인지"가 있다).
     내용 주소(쿼리가 곧 그림)인 카드는 OG_STATIC_CACHE_CONTROL(7일 + immutable),
     같은 URL 의 그림이 바뀌는 카드는 OG_DYNAMIC_CACHE_CONTROL 또는 자기 자리의 리터럴.
     이 테스트가 잠그는 것은 예나 지금이나 "모든 OG 라우트가 CDN 캐시 헤더를 싣는가" 다. */
  const byConstant = ["route.tsx", "complex/route.tsx", "note/route.tsx", "listing/route.tsx", "invite/route.tsx"];
  for (const p of byConstant) {
    assert.match(read(`app/api/og/${p}`), /"Cache-Control": OG_STATIC_CACHE_CONTROL,/, p);
  }
  assert.match(read("app/api/og/complex-trend/route.tsx"), /"Cache-Control": OG_DYNAMIC_CACHE_CONTROL,/);
  assert.match(
    read("app/api/og/market-card/route.tsx"),
    /"Cache-Control": "public, max-age=0, s-maxage=\d+, stale-while-revalidate=\d+"/,
  );
  const cache = read("lib/og/cache.ts");
  assert.match(cache, /OG_STATIC_CACHE_CONTROL =\s*\n?\s*"public, max-age=604800, s-maxage=604800, stale-while-revalidate=604800, immutable"/);
  assert.match(cache, /OG_DYNAMIC_CACHE_CONTROL =\s*\n?\s*"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"/);
});

test("사이트맵 자식 응답은 6시간 CDN 캐시", () => {
  const s = read("lib/seo/sitemap-sections.ts");
  assert.match(s, /SITEMAP_SECTION_CACHE_CONTROL =\s*"public, max-age=0, s-maxage=21600, stale-while-revalidate=86400"/);
  assert.match(s, /"Cache-Control": SITEMAP_SECTION_CACHE_CONTROL/);
});

test("next.config — /api 는 CSP 없는 보안 헤더 묶음, 캐치올에서 제외", () => {
  const cfg = read("next.config.ts");
  assert.match(cfg, /source: "\/\(\(\?!embed\/\|api\/\)\.\*\)"/);
  assert.match(cfg, /source: "\/api\/:path\*"/);
  assert.match(cfg, /base\.filter\(\(h\) => h\.key !== "Content-Security-Policy"\)/);
});
