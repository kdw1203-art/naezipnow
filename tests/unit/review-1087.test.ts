/* [1087] 소유자 2026-10-23 "추가적인 최적화도 진행해줘" — 그날 운영이 요금 한도로 일시 정지됐다(503 DEPLOYMENT_PAUSED).
 *  실측: 10/22 하루 요금 $10.5(ISR 쓰기 $5.3 · 오리진 전송 $3.2 — 평소의 4배). 단지 화면 UA 1% 표본 100건 중 59건이 meta-webindexer.
 *  단지 화면 저장 HTML(운영) 411KB 중 45KB 가 로딩 스켈레톤용 셸 한 벌(헤더·푸터 …) — 셸이 page 와 loading 에 각각 있었다.
 *  그래서: (1) meta-webindexer 를 robots·엣지 403 으로 막고 (2) 가장 많이 렌더되는 ISR 페이지(단지 · 지역별 실거래 구간)의 셸을
 *  레이아웃으로 올려 HTML·RSC 에 한 벌만 담는다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { BLOCKED_CRAWLERS, isBlockedCrawler } from "../../lib/security/blocked-crawlers";
import robots from "../../app/robots.ts";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const META_WEBINDEXER =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 (compatible; meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler))";

test("크롤러 — meta-webindexer 는 robots 전면 차단 + 엣지 403 · 공유 미리보기·AI 검색 인용 봇은 그대로", () => {
  assert.ok((BLOCKED_CRAWLERS as readonly string[]).includes("meta-webindexer"));
  assert.equal(isBlockedCrawler(META_WEBINDEXER), true);
  for (const ua of [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
  ]) {
    assert.equal(isBlockedCrawler(ua), false, ua);
  }
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  const meta = list.find((r) => r.userAgent === "meta-webindexer");
  assert.ok(meta, "robots 그룹");
  assert.equal(meta?.disallow, "/");
  /* /api 매처(정적 문자열)에도 같은 이름 — 미들웨어가 /api 에서도 403 */
  assert.match(read("middleware.ts"), /\|ImagesiftBot\|meta-webindexer\)\.\*"/);
});

test("단지 화면 — 셸은 layout 한 벌 · page·loading 은 안쪽만(ISR HTML 에 로딩용 셸이 저장되지 않게)", () => {
  const layout = strip(read("app/complex/[id]/layout.tsx"));
  assert.match(layout, /return <PageShell>\{children\}<\/PageShell>;/);
  assert.match(layout, /if \(!\(await exists\(pureIdFromParam\(decodeURIComponent\(raw\)\)\)\)\) notFound\(\);/, "404 판정은 셸보다 먼저");
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.doesNotMatch(page, /PageShell/);
  const loading = strip(read("app/complex/[id]/loading.tsx"));
  assert.doesNotMatch(loading, /PageShell/);
  assert.ok(existsSync("app/complex/[id]/loading.tsx"), "스켈레톤은 남긴다(클라이언트 이동 · 무거운 화면 목록)");
});

test("지역별 실거래 구간 — 같은 구조 · 경로 줄·제목은 같은 마크업(ShellBreadcrumb·ShellTitle)", () => {
  assert.match(strip(read("app/tx/[region]/layout.tsx")), /return <PageShell>\{children\}<\/PageShell>;/);
  for (const p of ["app/tx/[region]/page.tsx", "app/tx/[region]/[kind]/[band]/page.tsx"]) {
    const s = strip(read(p));
    assert.doesNotMatch(s, /<PageShell/, p);
    assert.match(s, /<ShellBreadcrumb>\{`홈 › 지역별 실거래 구간 › \$\{region\.name\}/, p);
    assert.match(s, /<ShellTitle>/, p);
  }
  assert.doesNotMatch(strip(read("app/tx/[region]/loading.tsx")), /PageShell/);
  const shell = read("app/components/PageShell.tsx");
  assert.match(shell, /export function ShellBreadcrumb\(/);
  assert.match(shell, /<nav aria-label="브레드크럼" className="mb-2 t-sub text-text-3">/);
  assert.match(shell, /<TitleTag className="rise-in mb-3\.5 t-title text-ink md:mb-4">\{children\}<\/TitleTag>/);
  assert.match(shell, /\{breadcrumb && <ShellBreadcrumb>\{breadcrumb\}<\/ShellBreadcrumb>\}/, "PageShell 도 같은 부품을 쓴다(마크업 한 곳)");
  /* 페이지 /tx(색인)는 레이아웃 밖 — 그대로 PageShell */
  assert.match(read("app/tx/page.tsx"), /<PageShell breadcrumb="홈 › 지역별 실거래 구간"/);
});

test("번들 예산 — 단지 셸이 레이아웃으로 옮겨 페이지 몫이 줄어든 만큼 예산도 낮춘다(게이트가 느슨해지지 않게)", () => {
  const src = read("scripts/check-bundle-budget.mjs");
  assert.match(src, /"\/complex\/\[id\]\/page": 435,/);
  assert.doesNotMatch(src, /"\/complex\/\[id\]\/page": 480,/);
});
