/* [1093] 소유자 2026-10-26 "대규모 개편과 대규모 최적화를 진행해줘".
 *  개편 1 — 공개 ISR 화면의 본문이 **숨은 조각**으로 저장되던 것. loading.tsx(Suspense 경계)가 있으면 React 가 본문을 <div hidden id="S:0">
 *  + $RC 스크립트로 내보낸다(ISR 첫 렌더 스트리밍 · 12.8KB 초과 경계). 운영 실측(JS 끈 채): 단지 화면의 보이는 글자는 셸(메뉴 · 푸터) 999자뿐,
 *  제목 · 사실 · 실거래 전부(1,898자)가 숨은 조각 — 2.4만 쪽. 뉴스 상세 · 구간 · 동네 · 분석 · 입주 물량 · 리포트 · 공개 노트도 같다.
 *  JS 를 돌리지 않는 크롤러 · AI 검색 봇(1087 에서 일부러 열어 둔 GPTBot · ClaudeBot · PerplexityBot …)은 셸만 읽었다.
 *  → 공개 화면 19곳의 loading.tsx 를 뺀다(1081 지역 상세와 같은 결정). 이동 표시는 NavigationProgress 막대(10초).
 *  개편 2 — 공개 노트 허브: 세 보기(격자 · 표 · 피드)를 전부 HTML 에 그리고 CSS 로 숨기던 것 → 피드는 골라야 그린다(HTML 42% · 168KB) ·
 *  셸(PageShell)이 클라이언트 조각 안에 있던 것 → (index) 레이아웃 한 벌.
 *  비용 — 비교 조합 1,119쪽을 적재마다 통째 비우던 것 → 바뀐 단지가 낀 조합만. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "loading.tsx") out.push(p);
  }
  return out;
}

/* ── 개편 1 — 공개 ISR 화면에 loading 경계 없음 ─────────────────────────── */

test("공개 화면 19곳의 loading.tsx 가 없다 · 남은 스켈레톤은 비공개 · 보관 · 지도뿐(전수)", () => {
  const REMOVED = [
    "app/analysis/ai/[tool]", "app/analysis", "app/apply/(index)", "app/auctions", "app/complex/[id]", "app/dev-deals/(index)", "app/digest/(index)",
    "app/imjang/(index)", "app/listings", "app/notes/(index)", "app/notes/[id]/(index)", "app/redevelopment/(index)", "app/rent/[region]",
    "app/reports/(index)", "app/search", "app/supply", "app/town", "app/town/news/(index)", "app/tx/[region]",
  ];
  for (const seg of REMOVED) assert.equal(existsSync(`${seg}/loading.tsx`), false, `${seg}/loading.tsx — 본문이 다시 숨은 조각이 된다`);
  /* 남는 곳 — 로그인 뒤 화면(마이 · 알림 · 노트 쓰기) · 심사 고정(요금제 · 포인트 상점) · 보관(Q&A) · 클라이언트 지도. 하나라도 늘면 이유를 적는다 */
  const KEEP = new Set([
    "app/map/loading.tsx", "app/my/(index)/loading.tsx", "app/notes/new/loading.tsx", "app/notifications/loading.tsx",
    "app/points/shop/loading.tsx", "app/qna/[id]/loading.tsx", "app/qna/loading.tsx", "app/subscription/loading.tsx",
  ]);
  assert.deepEqual(walk("app").sort(), [...KEEP].sort());
});

test("이동 표시 — NavigationProgress 상한 10초 · 진행바 곡선 10초(루트 레이아웃에 그대로)", () => {
  const src = strip(read("app/components/motion/NavigationProgress.tsx"));
  assert.match(src, /const MAX_MS = 10_000;/);
  assert.match(strip(read("app/layout.tsx")), /<NavigationProgress \/>/);
  const css = read("app/globals.css");
  const tail = css.slice(css.indexOf("[1093] 이동 진행바"));
  assert.match(tail, /\.nav-progress-bar \{\s*animation-duration: 10s;\s*\}/);
  assert.doesNotMatch(tail, /#[0-9a-fA-F]{6}\b|gradient|font-weight:\s*8|font-size:\s*\d/);
});

test("최종 게이트 · 1066 정책 — '스켈레톤이 있어야 한다' 에서 '공개 화면에는 없어야 한다' 로", () => {
  const gate = strip(read("scripts/check-final-release.mjs"));
  assert.match(gate, /const inlineRoutes = \[/);
  for (const p of ["app/complex/[id]/loading.tsx", "app/tx/[region]/loading.tsx", "app/town/news/(index)/loading.tsx", "app/notes/(index)/loading.tsx", "app/region/[id]/loading.tsx"]) {
    assert.ok(gate.includes(`"${p}"`), p);
  }
  assert.doesNotMatch(gate, /heavyRoutes/);
  assert.match(gate, /exists\("app\/map\/loading\.tsx"\)/, "지도 스켈레톤은 그대로");
});

/* ── 개편 2 — 공개 노트 허브 ──────────────────────────────────────────── */

test("공개 노트 허브 — 셸은 (index) 레이아웃 한 벌 · 피드 보기는 골라야 그린다 · 격자 · 표는 SSR 그대로", () => {
  assert.match(strip(read("app/notes/(index)/layout.tsx")), /return <PageShell>\{children\}<\/PageShell>;/);
  const client = strip(read("app/notes/notes-feed-client.tsx"));
  assert.doesNotMatch(client, /<PageShell|<\/PageShell>|PageShell \}/, "클라이언트 조각이 셸을 그리지 않는다");
  assert.match(client, /\{\(view === "feed" \|\| deskView === "feed"\) && \(\s*<div className=\{`flex-col gap-4 md:gap-4 \$\{view === "feed" \? "flex" : "hidden"\} \$\{deskView === "feed" \? "md:flex" : "md:hidden"\}`\}>/);
  /* 첫 화면 기본은 폰 목록(표 · [1101] 격자 → 목록) · 데스크톱 표 — 저장된 보기는 마운트 뒤에 읽으므로 SSR 과 수화가 같다 */
  assert.match(client, /useState<ViewMode>\("table"\)/);
  assert.match(client, /useState<DeskView>\("table"\)/);
  assert.match(client, /\{view === "grid" && \(/);
  assert.match(client, /deskView === "table" \? "md:block" : "md:hidden"/);
});

/* ── 비용 — 비교 조합 ─────────────────────────────────────────────────── */

test("실거래 적재 — 비교 조합은 바뀐 단지가 낀 조합만 비운다 · 목록 실패 · 상한이면 라우트 단위로 · 허브(/complex/compare)는 그대로", () => {
  const route = strip(read("app/api/cron/molit-transactions-ingest/route.ts"));
  assert.match(route, /import \{ complexPairPath, listComplexPairs \} from "@\/lib\/market\/complex-pairs";/);
  assert.match(route, /revalidatePath\("\/complex\/compare"\);\s*await invalidateTouchedPairs\(result\);/);
  assert.match(route, /async function invalidateTouchedPairs\(result: MolitIngestResult\): Promise<void> \{\s*const fallback = \(\) => revalidatePath\("\/complex\/compare\/\[slug\]", "page"\);/);
  assert.match(route, /if \(result\.touchedTruncated \|\| result\.touchedComplexes\.length === 0\) \{\s*fallback\(\);\s*return;\s*\}/);
  assert.match(route, /touched\.has\(key\(p\.regionName, p\.complexA\)\) \|\| touched\.has\(key\(p\.regionName, p\.complexB\)\)/);
  assert.match(route, /invalidatePathList\(paths, \{ budget: 600, label: "complex-pair" \}\);\s*if \(stats\.truncated\) fallback\(\);/);
  assert.match(route, /catch \(e\) \{\s*logger\.warn\("\[molit-tx\] 비교 조합 목록 읽기 실패 — 라우트 단위로 비운다", e\);\s*fallback\(\);/);
  /* 라우트 단위 비움은 대체 경로 안에만 */
  assert.equal((route.match(/revalidatePath\("\/complex\/compare\/\[slug\]", "page"\)/g) ?? []).length, 1);
});
