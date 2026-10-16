/* [1066] 검색 유입 손실 네 가지를 운영 실측으로 확인하고 고친 뒤, 되돌아가지 않게 잠근다.
 *  Y1 진짜 404 — 상세 11경로의 존재 확인이 loading 경계 **밖**(layout)에 있다.
 *  Y2 경계 정리 — 목록 화면의 스켈레톤은 라우트 그룹 안으로 들어가 상세를 덮지 않는다.
 *  Y3 h1 하나 — 스켈레톤의 머리는 h2 로 받는다(스켈레톤과 실제 머리가 한 문서에 함께 나간다).
 *  Y4 이미지 설명 — 색인되는 목록 썸네일의 alt 가 비어 있지 않다.
 *  Y5 홈 title — 검색되는 말이 브랜드 문장보다 **앞**에 온다.
 *
 * 실측 근거(2026-10-13, 운영 naezipnow.com + 로컬 탐침):
 *   없는 주소 12경로 중 11개가 200(소프트 404) · /tx 만 404(그 경로엔 스켈레톤이 없다).
 *   탐침 네 벌: 자기 loading+layout→404 / 조상 loading+layout→200 / 경계없음+page→404 / 자기 loading+page→200. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

/** 존재 확인을 레이아웃에 둔 상세 경로 — 자기 세그먼트에 loading.tsx 가 남아 있는 곳 */
const LAYOUT_GUARDED = [
  "app/complex/[id]",
  "app/notes/[id]",
  "app/region/[id]",
  "app/rent/[region]",
];

/** 조상 스켈레톤을 라우트 그룹 안으로 옮긴 목록 화면 */
const GROUPED = ["app/notes", "app/town/news", "app/reports", "app/redevelopment", "app/imjang", "app/digest"];

test("Y1 진짜 404 — 존재 확인이 layout 에 있고, 그 세그먼트의 스켈레톤은 그대로다", () => {
  for (const seg of LAYOUT_GUARDED) {
    const layout = `${seg}/layout.tsx`;
    assert.ok(existsSync(layout), `${layout} 없음 — page 에서만 notFound() 하면 200 이 된다`);
    const src = read(layout);
    assert.match(src, /notFound\(\)/, layout);
    assert.match(src, /from "next\/navigation"/, layout);
    /* 스켈레톤을 지우는 방식으로 404 를 얻지 않았다(로딩 중 빈 화면 방지) */
    assert.ok(existsSync(`${seg}/loading.tsx`), `${seg}/loading.tsx 가 사라졌다`);
  }
});

test("Y2 경계 — 목록 스켈레톤은 라우트 그룹 안에만 있고, 상세를 덮는 조상 loading 은 없다", () => {
  for (const seg of GROUPED) {
    assert.ok(existsSync(`${seg}/(index)/page.tsx`), `${seg}/(index)/page.tsx 없음`);
    assert.ok(existsSync(`${seg}/(index)/loading.tsx`), `${seg}/(index)/loading.tsx 없음`);
    /* 조상 자리에 남아 있으면 그 아래 상세 경로의 notFound() 가 다시 삼켜진다(탐침 ②) */
    assert.ok(!existsSync(`${seg}/loading.tsx`), `${seg}/loading.tsx 가 남아 있다 — 상세가 다시 200 이 된다`);
    assert.ok(!existsSync(`${seg}/page.tsx`), `${seg}/page.tsx 가 남아 있다 — 같은 주소에 두 쪽`);
  }
});

test("Y2b 경계 없는 상세는 page 의 notFound() 로 충분하다 — 그 자리에 스켈레톤을 새로 두지 않는다", () => {
  const PAGE_GUARDED: [string, string][] = [
    ["app/town/news/[id]", "if (!post) notFound()"],
    ["app/reports/[ym]", "notFound()"],
    ["app/imjang/[slug]", "if (!guide) notFound()"],
    ["app/digest/[week]", "notFound()"],
    ["app/redevelopment/[id]", "notFound()"],
    ["app/notes/best/[ym]", "notFound()"],
  ];
  for (const [seg, needle] of PAGE_GUARDED) {
    assert.ok(!existsSync(`${seg}/loading.tsx`), `${seg}/loading.tsx 가 생기면 다시 200 이 된다`);
    assert.ok(read(`${seg}/page.tsx`).includes(needle), `${seg}/page.tsx 에 ${needle} 없음`);
  }
});

test("Y3 h1 하나 — 스켈레톤 머리는 h2, 부품의 기본값은 h1 그대로", () => {
  /* 부품 셋이 머리 단계를 받는다 */
  assert.match(read("app/components/PageShell.tsx"), /titleAs: TitleTag = "h1"/);
  assert.match(read("app/components/PageShell.tsx"), /<TitleTag className="rise-in/);
  assert.match(read("app/town/TownHero.tsx"), /as = "h1"/);
  assert.match(read("app/town/news/NewsHead.tsx"), /as = "h1"/);

  /* 스켈레톤 열 곳이 h2 로 받는다 — 하나라도 빠지면 그 주소의 h1 이 둘이 된다 */
  const SKELETONS: [string, RegExp][] = [
    ["app/apply/loading.tsx", /<TownHero as="h2"/],
    ["app/auctions/loading.tsx", /<TownHero as="h2"/],
    ["app/qna/loading.tsx", /<TownHero as="h2"/],
    ["app/redevelopment/(index)/loading.tsx", /<TownHero as="h2"/],
    ["app/supply/loading.tsx", /<TownHero as="h2"/],
    ["app/town/news/(index)/loading.tsx", /<NewsHead as="h2"/],
    ["app/dev-deals/loading.tsx", /<PageShell titleAs="h2"/],
    ["app/imjang/(index)/loading.tsx", /<PageShell titleAs="h2"/],
    ["app/my/loading.tsx", /<PageShell titleAs="h2"/],
    ["app/search/loading.tsx", /<PageShell titleAs="h2"/],
  ];
  for (const [p, re] of SKELETONS) assert.match(read(p), re, p);
});

test("Y4 이미지 설명 — 색인되는 목록 썸네일에 alt 가 비어 있지 않다", () => {
  const CASES: [string, RegExp][] = [
    ["app/town/news/NewsListClient.tsx", /alt=\{row\.title\}/],
    ["app/components/home/HomeTownBlock.tsx", /alt=\{n\.title\}/],
    ["app/page.tsx", /alt=\{`\$\{n\.title\} 노트 커버`\}/],
    ["app/notes/best/[ym]/page.tsx", /alt=\{`\$\{p\.note\.title\} 노트 커버`\}/],
    ["app/notes/market/page.tsx", /alt=\{`\$\{note\.title\} 노트 커버`\}/],
    ["app/notes/[id]/RelatedNotes.tsx", /alt=\{`\$\{n\.title\} 노트 커버`\}/],
  ];
  for (const [p, re] of CASES) assert.match(read(p), re, p);
  /* 노트 피드의 두 자리 — 44px·36px 모두 */
  const feed = read("app/notes/notes-feed-client.tsx");
  assert.equal((feed.match(/alt=\{`\$\{n\.title\} 노트 커버`\}/g) ?? []).length, 2);
  /* 장식 그림(Illust)은 alt 를 비운 채 둔다 — 읽기 보조기기에 잡음을 늘리지 않는다 */
  assert.match(read("app/components/Illust.tsx"), /alt=""/);
});

test("Y5 홈 title — 검색되는 말이 브랜드 문장보다 앞", () => {
  const KEY = "아파트 실거래가 조회";
  const BRAND = "시세는 누구나 봅니다";
  for (const p of ["app/layout.tsx", "lib/seo/page-metadata.ts"]) {
    const src = read(p);
    const line = src.split("\n").find((l) => l.includes("title:") && l.includes(KEY));
    assert.ok(line, `${p} 의 title 에 "${KEY}" 없음`);
    assert.ok(line.indexOf(KEY) < line.indexOf(BRAND), `${p}: 검색어가 브랜드 문장보다 뒤에 있다`);
  }
  /* 공유 카드(openGraph)는 브랜드 문장 그대로 — 바꾸지 않았다 */
  assert.match(read("app/layout.tsx"), /openGraph: \{\s*\n\s*title: "내집나우 — 시세는 누구나 봅니다/);
});
