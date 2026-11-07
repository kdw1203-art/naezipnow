import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  ACTIVE_AI_TOOL_IDS,
  AI_TOOL_IDS,
  CORE_AI_TOOL_IDS,
  RETIRED_AI_TOOLS,
  isActiveAiToolId,
  isRetiredAiToolId,
  retiredAiToolTarget,
} from "../../lib/ai/ai-tools.ts";
import { REDIRECT_RULES } from "../../lib/seo/redirect-map.ts";
import { RADAR_AXIS_FOLLOW_UP } from "../../lib/ai/next-action-routing.ts";
import { SIGNAL_FOLLOW_UP, TOOL_FOLLOW_UP } from "../../lib/ai/conclusion-next.ts";
import { compareActionLinks } from "../../lib/market/compare-conclusion.ts";

/* ============================================================
   [1109] AI 분석 통폐합 — 구조 계약
     ① 도구 12 → 4: 살아 있는 4종(CORE) · 통합 8종은 같은 일을 하는 실존 화면으로(1홉) · 합치면 12 그대로(빠지는 도구 없음)
     ② 주소: 통합 도구 화면은 라우트 안에서 308(searchParams 안 읽음 — ISR 유지) · 사이트맵 · 미리 그리기는 4종만 · 실행 API 410
     ③ 허브: "그 밖의 도구" 칸 없음 · "예시 계산" 접힘 구역 없음 · 시나리오는 지역 시세 표의 한 줄
     ④ /analysis/portfolio 삭제 → /calculator(정확 일치 표 · 옛 /ai-analysis/ai-portfolio 도 같은 곳 — 2단 홉 없음)
     ⑤ 결과 화면 안의 이어서 볼 도구는 살아 있는 4종 안에서만 · 비교 표의 자기 링크 없음
   ============================================================ */

const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

/** 내부 경로가 실존 라우트인가 — app/<path>/page.tsx(라우트 그룹 (index) 포함) */
function routeExists(href: string): boolean {
  const p = href.split("?")[0];
  /* 살아 있는 도구 화면은 동적 라우트(/analysis/ai/[tool]) */
  if (p.startsWith("/analysis/ai/")) return isActiveAiToolId(p.slice("/analysis/ai/".length)) && existsSync("app/analysis/ai/[tool]/page.tsx");
  const dir = `app${p}`;
  return existsSync(`${dir}/page.tsx`) || existsSync(`${dir}/(index)/page.tsx`);
}

test("① 도구 12 → 4 — 살아 있는 4종 = CORE · 통합 8종은 실존 화면으로 · 합치면 12", () => {
  assert.deepEqual([...ACTIVE_AI_TOOL_IDS], [...CORE_AI_TOOL_IDS]);
  const retired = Object.keys(RETIRED_AI_TOOLS).sort();
  assert.equal(retired.length, 8);
  assert.deepEqual([...ACTIVE_AI_TOOL_IDS, ...retired].sort(), [...AI_TOOL_IDS].sort());
  for (const [id, to] of Object.entries(RETIRED_AI_TOOLS)) {
    assert.ok(to.startsWith("/"), id);
    assert.ok(routeExists(to), `${id} → ${to} 실존 라우트 아님`);
    assert.ok(!to.startsWith("/analysis/ai/") || isActiveAiToolId(to.slice("/analysis/ai/".length)), `${id} → 살아 있는 도구가 아닌 도구로`);
    assert.ok(!REDIRECT_RULES.some((r) => r.from === to.split("?")[0]), `${id} → ${to} 는 다른 규칙의 from(2단 홉)`);
  }
  assert.equal(isRetiredAiToolId("ai-risk"), true);
  assert.equal(isRetiredAiToolId("ai-diagnosis"), false);
  assert.equal(isActiveAiToolId("ai-timing"), true);
  assert.equal(retiredAiToolTarget("ai-compare"), "/analysis/compare");
  assert.equal(retiredAiToolTarget("ai-compare", "ids=a%2Cb"), "/analysis/compare?ids=a%2Cb");
  assert.equal(retiredAiToolTarget("ai-diagnosis"), null);
});

test("② 주소 — 도구 화면은 통합 id 를 308 · searchParams 안 읽음 · 미리 그리기 · 사이트맵은 4종 · 실행 API 410", () => {
  const page = strip(read("app/analysis/ai/[tool]/page.tsx"));
  assert.match(page, /if \(isRetiredAiToolId\(tool\)\) permanentRedirect\(retiredAiToolTarget\(tool\) \?\? "\/analysis"\);/);
  assert.doesNotMatch(page, /searchParams/, "읽으면 살아 있는 4종의 ISR 이 깨진다");
  assert.match(page, /return ACTIVE_AI_TOOL_IDS\.map\(\(tool\) => \(\{ tool \}\)\);/);
  assert.match(page, /robots: \{ index: false, follow: true \}/);
  assert.match(read("lib/seo/build-sitemap.ts"), /for \(const tool of ACTIVE_AI_TOOL_IDS\)/);
  const api = strip(read("app/api/ai/analysis/route.ts"));
  assert.match(api, /if \(isRetiredAiToolId\(tool as string\)\) \{\s*return NextResponse\.json\(\{ error: "통합된 도구입니다\.", redirectTo: [^}]+\}, \{ status: 410 \}\);/);
  /* 옛 결과 화면 — 통합 도구의 결과는 "다시 계산" 대신 통합된 화면으로 */
  const r = strip(read("app/analysis/ai/r/[id]/page.tsx"));
  assert.match(r, /retiredAiToolTarget\(run\.tool\) \?/);
  assert.match(r, /통합된 화면 열기 ›/);
});

test("③ 허브 — 그 밖의 도구 칸 없음 · 예시 계산 구역 없음 · 시나리오는 지역 시세 표 · 계열 N종 = 4", () => {
  const cat = strip(read("app/analysis/tool-catalog.ts"));
  assert.match(cat, /export const WORKBENCH_MORE: readonly AiAnalysisToolId\[\] = \[\];/);
  assert.match(cat, /export const AI_TOOL_COUNT = ACTIVE_AI_TOOL_IDS\.length;/);
  assert.match(cat, /export const MARKET_LIVE = HUB_TOOLS\.filter\(\(t\) => t\.tier === "market"\);/);
  assert.doesNotMatch(cat, /href: "\/analysis\/portfolio"/);
  const hub = strip(read("app/analysis/page.tsx"));
  assert.doesNotMatch(hub, /hub-sim|SIM_TOOLS|<ToolCard/);
  assert.match(hub, /toolTitles=\{Object\.fromEntries\(AI_TOOL_IDS\.map\(\(id\) => \[id, TOOL_IDENTITIES\[id\]\.title\]\)\)\}/, "옛 결과 제목은 12종 전부");
  /* 메뉴의 AI 분석 하위는 1108 의 질문 3 계열 그대로 */
  const nav = read("app/components/nav-data.ts");
  for (const h of ["/analysis#tier-complex", "/analysis#tier-market", "/analysis#tier-record"]) assert.ok(nav.includes(`"${h}"`), h);
});

test("④ /analysis/portfolio 삭제 → /calculator — 표 1홉 · 옛 /ai-analysis/ai-portfolio 도 같은 곳 · 참조 정리", () => {
  assert.ok(!existsSync("app/analysis/portfolio/page.tsx"));
  const rule = REDIRECT_RULES.find((r) => r.from === "/analysis/portfolio");
  assert.equal(rule?.to, "/calculator");
  assert.equal(REDIRECT_RULES.find((r) => r.from === "/ai-analysis/ai-portfolio")?.to, "/calculator");
  for (const f of ["app/robots.ts", "lib/http/cache-policy.ts", "scripts/check-links.mjs", "app/analysis/ToolGlyph.tsx", "lib/ai/tool-persona.ts"]) {
    assert.ok(!read(f).includes("/analysis/portfolio"), `${f} 에 /analysis/portfolio 참조가 남았다`);
  }
});

test("⑤ 이어서 볼 도구 · 링크 — 살아 있는 4종 안에서만 · 통합 도구 주소를 만드는 곳 없음", () => {
  const live = new Set<string>(ACTIVE_AI_TOOL_IDS);
  for (const [k, v] of Object.entries(RADAR_AXIS_FOLLOW_UP)) assert.ok(live.has(v.tool), `radar ${k} → ${v.tool}`);
  for (const [k, v] of Object.entries(SIGNAL_FOLLOW_UP)) assert.ok(live.has(v.tool), `signal ${k} → ${v.tool}`);
  for (const [k, v] of Object.entries(TOOL_FOLLOW_UP)) assert.ok(live.has(v.tool), `tool ${k} → ${v.tool}`);
  assert.deepEqual(compareActionLinks(["a", "b", "c"]).map((l) => l.href), ["/notifications", "/map"]);
  assert.match(read("lib/ai/live-context.ts"), /href: "\/analysis\/scenario",/);
  assert.match(read("app/api/cron/economy-alerts/route.ts"), /actionUrl: "\/analysis\/scenario",/);
  /* 앱 안에서 통합 도구 주소를 글자로 만드는 곳이 없다(주석 제외) */
  const files = ["lib/ai/live-context.ts", "lib/market/compare-conclusion.ts", "app/api/cron/economy-alerts/route.ts", "app/analysis/page.tsx", "app/components/nav-data.ts"];
  for (const f of files) {
    const s = strip(read(f));
    for (const id of Object.keys(RETIRED_AI_TOOLS)) assert.ok(!s.includes(`/analysis/ai/${id}`), `${f}: ${id}`);
  }
});
