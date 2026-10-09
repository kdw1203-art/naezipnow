/* [1044] 뉴스 · 동네글 분리 — 소유자 지시(2026-10-06) "뉴스랑 동네글을 분리해줘"(메뉴까지).
 *
 * 잠그는 사실:
 *  ① 뉴스는 내비의 제 대분류다(동네 하위가 아니다). 주소는 그대로(/town/news · /digest).
 *  ② 주소가 /town 아래라도 뉴스 화면에서는 뉴스만 켜진다 — GNB · 모바일 전체 메뉴(navGroupOf) · 탭바.
 *  ③ 동네 화면(동네이야기 · 동네 홈)은 기사를 읽지도 그리지도 않는다.
 *  ④ 뉴스 화면에는 동네 카테고리 줄·"동네이야기 ›" 빵부스러기가 없다. 머리 모양(PageHead)은 그대로다. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NAV, navGroupOf, navItemActive } from "../../app/components/nav-data.ts";
import {
  TOWN_TAB_EXCEPT_PREFIXES,
  TOWN_TAB_EXTRA_PREFIXES,
  tabBarActive,
} from "../../lib/client/shell-gates.ts";
import { TOWN_CATEGORY_LINKS } from "../../lib/town/category-links.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** 주석을 뗀 코드 — 사유 주석에 옛 이름이 남아 있어도 걸리지 않게 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/* ── ① 내비 ─────────────────────────────────────────────────────────────── */

test("뉴스는 제 대분류 — 동네 다음, 요금제 앞 · 주소는 그대로", () => {
  assert.deepEqual(
    NAV.map((g) => g.label),
    ["임장노트", "지도", "AI 분석", "동네", "뉴스", "요금제"],
  );
  const news = NAV.find((g) => g.label === "뉴스");
  assert.ok(news);
  assert.equal(news.href, "/town/news", "주소는 옮기지 않는다(색인 · 공유 링크)");
  assert.deepEqual(
    (news.children ?? []).map((c) => [c.label, c.href]),
    [
      ["뉴스룸", "/town/news"],
      ["주간 다이제스트", "/digest"],
    ],
  );
  const town = NAV.find((g) => g.label === "동네");
  assert.deepEqual(
    (town?.children ?? []).map((c) => c.href),
    /* [1047] 전문가 찾기 — 보관 해제(소유자 지시 2026-10-09) */
    ["/town", "/apply", "/redevelopment", "/town/experts"],
  );
});

test("동네 카테고리 줄 — 뉴스룸 칸 없음 · [1047] 전문가 칸이 맨 끝", () => {
  assert.deepEqual(
    TOWN_CATEGORY_LINKS.map((l) => l.href),
    ["/town", "/apply", "/auctions", "/supply", "/redevelopment", "/town/experts"],
  );
  assert.ok(!code("lib/town/category-links.ts").includes("newsroom"), "입구 표식(entry) 없음");
  assert.ok(!code("app/town/TownCategoryNav.tsx").includes("news-entry-card"));
});

/* ── ② 활성 판정 ─────────────────────────────────────────────────────────── */

test("navGroupOf — 가장 긴 접두 하나: 뉴스 화면에서 동네는 꺼지고 뉴스만 켜진다", () => {
  const label = (p: string) => navGroupOf(p)?.label ?? null;
  for (const p of ["/town/news", "/town/news/abc-123", "/town/news/tag/jaegeonchug", "/digest", "/digest/2026-W40"]) {
    assert.equal(label(p), "뉴스", p);
  }
  for (const p of ["/town", "/town/gangnam", "/town/story/abc", "/town/write"]) {
    assert.equal(label(p), "동네", p);
  }
  assert.equal(label("/notes/new"), "임장노트");
  assert.equal(label("/map"), "지도");
  assert.equal(label("/analysis/ai/ai-diagnosis"), "AI 분석");
  assert.equal(label("/subscription/checkout"), "요금제");
  /* 세그먼트 단위 — 비슷한 글자로 시작하는 남의 경로는 켜지 않는다 */
  for (const p of ["/", "/townhouse", "/town/newsletter", "/digests", "/mapping", "/my"]) {
    const g = label(p);
    assert.ok(g !== "뉴스", `${p} 에서 뉴스가 켜지면 안 된다`);
  }
  assert.equal(label("/townhouse"), null);
  assert.equal(label("/town/newsletter"), "동네", "/town/news 의 접두가 아니다 — 동네 아래 다른 화면");
  /* 한 경로에서 켜지는 대분류는 많아야 하나 */
  for (const p of ["/town/news", "/town", "/digest", "/notes", "/"]) {
    assert.ok(NAV.filter((g) => navItemActive(g, p)).length <= 1, p);
  }
});

test("GNB · 모바일 전체 메뉴가 같은 판정(navGroupOf)을 쓴다", () => {
  for (const p of ["app/components/Header.tsx", "app/components/MobileMenu.tsx"]) {
    assert.match(code(p), /navGroupOf\(pathname\)/, p);
  }
  /* 대분류 아이콘 표 — 뉴스 칸이 빠지면 좌측 내비는 동그라미, 전체 메뉴는 돋보기로 떨어진다 */
  for (const p of ["app/components/DesktopSideNav.tsx", "app/components/MobileMenu.tsx"]) {
    assert.match(read(p), /뉴스: "newspaper"/, p);
  }
});

test("탭바 — 뉴스 화면에서는 동네 탭이 켜지지 않는다(탭 다섯에 뉴스 자리는 없다)", () => {
  const on = (p: string) => tabBarActive("/town", p, TOWN_TAB_EXTRA_PREFIXES, TOWN_TAB_EXCEPT_PREFIXES);
  for (const p of ["/town/news", "/town/news/abc", "/town/news/tag/cheongyag"]) assert.equal(on(p), false, p);
  for (const p of ["/town", "/town/mapo", "/town/story/x", "/apply", "/redevelopment/1"]) assert.equal(on(p), true, p);
  assert.equal(on("/town/newsletter"), true, "제외도 세그먼트 단위");
  /* 제외 목록은 내비의 뉴스 href 와 같다 — 주소가 바뀌면 여기서 걸린다 */
  const news = NAV.find((g) => g.label === "뉴스");
  assert.deepEqual([...TOWN_TAB_EXCEPT_PREFIXES], [news?.href]);
  assert.match(code("app/components/TabBar.tsx"), /except: TOWN_TAB_EXCEPT_PREFIXES/);
  /* 넷째 인자를 주지 않으면 예전과 같다(다른 탭의 호출부는 그대로) */
  assert.equal(tabBarActive("/town", "/town/news", TOWN_TAB_EXTRA_PREFIXES), true);
  assert.equal(tabBarActive("/my", "/my/settings"), true);
});

/* ── ③ 동네 화면은 기사를 싣지 않는다 ─────────────────────────────────────── */

test("동네이야기 · 동네 홈 — 뉴스 조립기·스트립·기사 링크 없음", () => {
  assert.equal(existsSync(new URL("../../app/town/TownNewsStrip.tsx", import.meta.url)), false, "스트립 부품 삭제");
  for (const p of ["app/town/page.tsx", "app/town/[region]/page.tsx"]) {
    const c = code(p);
    for (const s of ["TownNewsStrip", "buildNewsRows", "news-list", "/town/news", "isAutomated", "뉴스"]) {
      assert.ok(!c.includes(s), `${p}: ${s}`);
    }
  }
  /* 동네 홈의 제목·설명도 없는 것을 적지 않는다 */
  const region = code("app/town/[region]/page.tsx");
  assert.match(region, /동네 홈 · 이웃 글 · 시장 요약 \| 내집나우/);
  /* 1043 부터 피드에 유형 필터가 없다 — ?kind=post 링크가 남아 있으면 죽은 쿼리다 */
  assert.ok(!region.includes("?kind=post"));
  /* 이웃 글 피드는 사람이 쓴 글만(자동수집 제외) — 판정은 그대로 isStoryPost */
  assert.match(code("lib/town/feed.ts"), /posts\.filter\(\(p\) => isStoryPost\(p\)/);
});

/* ── ④ 뉴스 화면 ─────────────────────────────────────────────────────────── */

test("뉴스룸 — 제 머리(NewsHead = PageHead) · 동네 카테고리 줄 없음 · 빵부스러기에 동네이야기 없음", () => {
  const page = code("app/town/news/page.tsx");
  /* 대분류 첫 화면 — 빵부스러기 없음(제목 위에 같은 낱말이 한 번 더 서지 않게) */
  assert.match(page, /<PageShell wide>/);
  assert.match(page, /<NewsHead \/>/);
  for (const s of ["TownHero", "TownCategoryNav", "동네이야기"]) assert.ok(!page.includes(s), s);
  const head = code("app/town/news/NewsHead.tsx");
  assert.match(head, /<PageHead/);
  assert.match(head, /href="\/digest"/);
  assert.ok(!head.includes("btn-primary"), "머리 버튼은 테두리형 하나");
  /* 로딩 중과 로딩 후가 같은 머리 */
  const loading = code("app/town/news/loading.tsx");
  assert.match(loading, /<NewsHead \/>/);
  assert.ok(!loading.includes("newsroom-masthead"));
  assert.match(loading, /<PageShell wide>/);
  /* 뉴스 하위 화면의 빵부스러기는 전부 "뉴스룸"으로 시작한다 */
  assert.match(code("app/town/news/[id]/page.tsx"), /breadcrumb=\{`뉴스룸 › /);
  assert.match(code("app/town/news/tag/[tag]/page.tsx"), /breadcrumb=\{`뉴스룸 › /);
  assert.match(code("app/digest/page.tsx"), /breadcrumb="뉴스룸 › 주간 다이제스트"/);
});

test("남은 사실 문장 — 공개 노트는 임장노트에 실린다(동네이야기 피드가 아니다)", () => {
  const detail = code("app/town/news/[id]/page.tsx");
  assert.ok(!detail.includes("동네이야기 피드에 실림"));
  assert.match(detail, /공개 노트는 임장노트에 실림/);
});
