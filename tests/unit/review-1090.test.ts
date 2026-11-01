/* [1090] 소유자 2026-10-25 "대규모 최적화를 진행해줘" — 운영은 사용 요금 한도로 일시 정지(503) 중 · 1089 는 푸시됐으나 BLOCKED.
 *  1089 뒤 남은 태그를 전수로 따라가 보니 단지 화면(2.4만 쪽)에 아직 **일정으로 비워지는 태그 둘**이 붙어 있었다:
 *  town-posts(뉴스 재검증 크론 하루 3슬롯 → invalidateTownDataCaches) · supply(입주물량 적재 매일 → invalidateAfterIngest).
 *  뉴스 상세(1,400여 쪽)에도 town-posts. 즉 1089 의 7일 수명이 하루 네 번 무효가 되는 구조였다.
 *  그래서: (1) 두 화면은 태그 없는 판(관련 글 목록 · 입주물량)을 읽는다 (2) 입주물량 적재는 바뀐 날에만 비운다
 *  (3) 빌드 게이트가 일정 태그 전부를 본다 (4) 동네이야기 · 분석 구역의 셸을 레이아웃으로(로딩 스켈레톤의 셸 한 벌 제거 — 1087 과 같은 구조). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

test("단지 화면 · 뉴스 상세 — 관련 글 목록은 태그 없는 판 · 단지 입주물량 캐시는 태그 없음(일정 비움이 화면에 번지지 않게)", () => {
  const board = strip(read("lib/newui/board-posts.ts"));
  assert.match(board, /\["related-town-posts-stale-v1"\],\s*\{ revalidate: 604_800 \}/);
  assert.match(board, /export const readRelatedTownPostsStale = cache\(/);
  /* 태그 판은 그대로(동네 홈 · 홈 · 피드 — 뉴스 적재 때 새로 읽어야 한다) */
  assert.match(board, /\["related-town-posts-v1"\],\s*\{ revalidate: 604_800, tags: \["news", TOWN_POSTS_TAG\] \}/);

  const loaders = strip(read("app/complex/[id]/section-loaders.ts"));
  assert.match(loaders, /import \{ readRelatedTownPostsStale \} from "@\/lib\/newui\/board-posts";/);
  assert.doesNotMatch(loaders, /readRelatedTownPosts\(/, "단지 화면은 태그 판을 부르지 않는다");
  assert.match(loaders, /\["upcoming-supply-v3"\],\s*\{ revalidate: 604_800 \}/);
  assert.doesNotMatch(loaders, /tags: \["supply"\]/);

  const news = strip(read("app/town/news/[id]/page.tsx"));
  assert.match(news, /import \{ getTownPost, readRelatedTownPostsStale \} from "@\/lib\/newui\/board-posts";/);
  assert.doesNotMatch(news, /readRelatedTownPosts\(/);
});

test("입주물량 적재 — 무엇인가 바뀐 날에만 supply 태그 · 경로를 비운다", () => {
  const src = strip(read("app/api/cron/supply-ingest/route.ts"));
  assert.match(
    src,
    /const anyChanged =\s*result\.upserted \+ result\.migrated \+ result\.announcementsUpserted \+ result\.competitionUpserted > 0;\s*if \(anyChanged\) invalidateAfterIngest\("supply"\);/,
  );
  assert.doesNotMatch(src, /^\s*invalidateAfterIngest\("supply"\);/m, "무조건 비우는 줄이 없다");
});

test("빌드 게이트 — 일정으로 비워지는 태그 전부 · 같은 모듈의 태그 판은 이유와 함께 허용", () => {
  const gate = read("scripts/check-isr-ttl.mjs");
  assert.match(gate, /const GLOBAL_TAGS = \["market", "economy", "supply", "town-posts", "weekly-digest", "map-region-markers", "map-danji", "home-data"\];/);
  assert.match(gate, /"complex\/\[id\]\|related-town-posts-v1": "단지 화면은 태그 없는 판/);
  assert.match(gate, /"town\/news\/\[id\]\|related-town-posts-v1": "뉴스 상세는 태그 없는 판/);
  /* 허용 목록에 없는 supply 태그 캐시가 단지 번들에 있으면 실패해야 한다 — 허용 목록에 upcoming-supply 가 없다 */
  assert.doesNotMatch(gate, /upcoming-supply/);
});

test("동네이야기 · 분석 — 셸은 layout 한 벌 · page · loading 은 안쪽만(ShellBreadcrumb · ShellTitle · ShellNarrow · tool-scope 판)", () => {
  assert.match(strip(read("app/town/layout.tsx")), /return <PageShell wide>\{children\}<\/PageShell>;/);
  assert.match(strip(read("app/analysis/layout.tsx")), /return <PageShell>\{children\}<\/PageShell>;/);
  for (const dir of ["app/town", "app/analysis"]) {
    for (const f of walk(dir)) {
      if (f.endsWith("/layout.tsx")) continue;
      const s = strip(read(f));
      assert.doesNotMatch(s, /<PageShell|<\/PageShell>|\{ PageShell \}/, `${f}: 셸은 레이아웃에만`);
    }
  }
  /* [1093] 동네 · 뉴스룸 · 분석의 loading.tsx 는 없다 — 본문이 숨은 조각으로 저장되지 않게(review-1093) */
  for (const f of ["app/town/loading.tsx", "app/town/news/(index)/loading.tsx", "app/analysis/loading.tsx"]) assert.equal(existsSync(f), false, f);
  /* 보통 폭 화면은 ShellNarrow(본문 1200px — PageShell 보통 벌과 같다) · 넓은 화면은 그대로 */
  const shell = read("app/components/PageShell.tsx");
  assert.match(shell, /export function ShellNarrow\(/);
  assert.match(shell, /<div className="mx-auto w-full max-w-\[1200px\]">\{children\}<\/div>/);
  assert.match(strip(read("app/town/news/[id]/page.tsx")), /<ShellNarrow>\s*<ShellBreadcrumb>\{`뉴스룸 › \$\{category\} › \$\{region\}`\}<\/ShellBreadcrumb>/);
  assert.match(strip(read("app/town/story/[id]/page.tsx")), /<ShellNarrow>\s*<ShellBreadcrumb>/);
  assert.doesNotMatch(strip(read("app/town/[region]/page.tsx")), /ShellNarrow/, "동네 홈은 넓은 벌 그대로");
  assert.doesNotMatch(strip(read("app/town/page.tsx")), /ShellNarrow/);
  /* 도구 색 화면 — .tool-scope 판(변수 · 자손 규칙뿐이라 main 에 있던 것과 같다) */
  for (const f of ["app/analysis/gap/page.tsx", "app/analysis/timing/page.tsx", "app/analysis/temperature/page.tsx"]) {
    assert.match(strip(read(f)), /<div className="tool-scope" style=\{personaVars\(TOOL_PERSONAS\["market:[a-z]+"\]\)\}>\s*<ShellBreadcrumb>/, f);
  }
  assert.match(strip(read("app/analysis/temperature/[region]/page.tsx")), /<ShellBreadcrumb>[^\n]*<\/ShellBreadcrumb>\s*<ShellTitle>\{`\$\{region\.label\} 시장 온도 주간 기록`\}<\/ShellTitle>/);
  /* 모임 채팅 — 셸 위 고정 판 */
  const chat = strip(read("app/town/groups/[id]/chat/page.tsx"));
  assert.match(chat, /<div className="fixed inset-0 z-\[60\] overflow-y-auto bg-bg">\{children\}<\/div>/);
  assert.equal((chat.match(/<ChatScreen>/g) ?? []).length, 3, "세 화면(없음 · 로그인 안내 · 채팅방) 전부");
  /* 분석 오류 화면 — 셸 안이라 main 을 겹치지 않는다 */
  assert.match(strip(read("app/analysis/error.tsx")), /inShell/);
  assert.match(strip(read("app/components/AreaError.tsx")), /const Body = inShell \? "div" : "main";/);
  /* [1092] 전월세 구역도 셸이 레이아웃으로 올라갔다 — 오류 화면은 inShell */
  assert.match(strip(read("app/rent/[region]/error.tsx")), /inShell/);
  assert.equal(existsSync("app/town/groups/[id]/chat/layout.tsx"), false);
});
