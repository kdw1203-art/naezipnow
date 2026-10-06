import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";
import { seedGradient } from "@/lib/town/shared";
import { buildTownCategorySubs, kstDayOf, kstYmOf } from "@/lib/town/category-subs";
import { JOURNEY_STAGES, journeyCountLabels } from "@/lib/journey/stages";

/* [1012] 동네·뉴스·청약·입주·공매·정비사업·다이제스트·Q&A·전문가 축 —
 * docs/design-system.md v3 "형태·문구 규율" 이 이 축의 화면 소스에 실제로 적용됐는지 잠근다.
 *
 * 두 종류다.
 *  1) 소스 규칙 — 게이트(scripts/check-ai-look.mjs)가 기계적으로 막는 것(이모지·금지 문구·
 *     장식 그라데이션·큰 그림자)에 더해, 게이트가 안 보는 굵기 800(font-extrabold)·유리(glass) 칩·
 *     권유형 빈 화면 문구("남겨 보세요")까지 이 축의 경로 전체에서 0 이어야 한다.
 *  2) 카탈로그·컴포넌트 규칙 — 카테고리 카드 부제는 숫자만, 아이콘 칩 색은 한 가지, 히어로는
 *     슬로건 대신 실데이터 한 줄.
 *
 * 문구를 못 박는 옛 테스트는 없었다(grep 결과 0건) — 갱신할 테스트도 없다. */

const ROOTS = [
  "app/town",
  "app/apply",
  "app/supply",
  "app/auctions",
  "app/redevelopment",
  "app/digest",
  "app/qna",
  "app/data",
  "app/data-sources",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}
const FILES = ROOTS.flatMap((r) => walk(r));
const read = (p: string): string => readFileSync(p, "utf8");
/** 주석은 규칙 기록을 남기는 자리라 검사에서 뺀다(게이트와 같은 방식) */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}

/* ── 1. 소스 규칙 (이 축 경로 전체) ─────────────────────────────────────────── */

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]|[\u{2728}\u{2B50}\u{2705}\u{274C}\u{2757}]/u;
const BANNED = ["지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로", "Learn more", "Get started"];

test("[1012] 규칙 4·5 — 담당 경로의 UI 문자열에 이모지·금지 문구가 없다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const lines = stripComments(read(f)).split("\n");
    lines.forEach((line, i) => {
      const l = line.replace(/name=\{?"[^"]*"\}?/g, "");
      if (EMOJI_RE.test(l)) bad.push(`${f}:${i + 1} 이모지`);
      for (const ph of BANNED) if (line.includes(ph)) bad.push(`${f}:${i + 1} "${ph}"`);
    });
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 3 — 장식 그라데이션은 0 (가로 레일 mask-image 만 예외)", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    if (f.endsWith("app/town/TownCategoryNav.tsx")) continue; // 레일 오른쪽 페이드 마스크(게이트 예외 목록과 같다)
    const src = stripComments(read(f));
    if (/(?:linear|radial|conic|repeating-linear)-gradient\(|bg-gradient-to-/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 8·2 — font-extrabold/font-black · 손으로 적은 그림자 · 유리 칩(glass) 이 없다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    const src = stripComments(read(f));
    if (/font-(?:extrabold|black)/.test(src)) bad.push(`${f} 굵기 800+`);
    /* [1014] 임의 그림자·유리 칩 검사는 뺐다 — 주인님이 개편(v4) 전 모습(리퀴드 유리 히어로 칩)을 되살리라 했다 */
  }
  assert.deepEqual(bad, []);
});

test("[1012] 규칙 1 — 본문 카드(.card)에 12px(rounded-3xl) 를 덧씌우지 않는다", () => {
  const bad: string[] = [];
  for (const f of FILES) {
    stripComments(read(f))
      .split("\n")
      .forEach((line, i) => {
        if (!/rounded-3xl/.test(line)) return;
        if (!/(^|[\s"`'])card([\s"`']|$)/.test(line)) return;
        if (/brand-navy-card|ai-panel|bg-brand-hanji/.test(line)) return;
        bad.push(`${f}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});

/* ── 2. 카탈로그·컴포넌트 규칙 ─────────────────────────────────────────────── */

test("[1012] 자료실 — 커버 면 prop 은 face 이고 값은 단색 토큰", () => {
  const browser = read("app/town/library/LibraryBrowser.tsx");
  assert.match(browser, /face: string;/);
  assert.doesNotMatch(stripComments(browser), /n\.gradient/);
  assert.match(read("app/town/library/page.tsx"), /face: seedGradient\(/);
  for (const seed of ["강남구", "마포구", "x", ""]) {
    assert.match(seedGradient(seed), /^var\(--[a-z-]+\)$/, "단색 토큰이어야 한다");
  }
});

test("[1012 · R2] buildTownCategorySubs — 실집계가 있는 칸만 짧은 숫자 부제, null·0 은 비운다", () => {
  const subs = buildTownCategorySubs({
    counts: { applyOpen: 12, onbidActive: 1130, supplyMonth: 7, supplyYm: "202609", redevZones: 214 },
    weekPosts: 3,
  });
  assert.deepEqual(subs, {
    "/town": "이번 주 새 글 3",
    "/apply": "접수 중 12건",
    "/auctions": "진행 1,130건",
    "/supply": "9월 입주 7곳",
    "/redevelopment": "구역 214곳",
  });
  /* 모든 키는 카탈로그의 href 다 — 없는 칸에 숫자를 만들지 않는다 */
  const hrefs = new Set(TOWN_CATEGORY_LINKS.map((l) => l.href));
  for (const k of Object.keys(subs)) assert.ok(hrefs.has(k), k);
  /* 조회 실패(null)·0·음수·NaN 은 부제 없음 — 지어내지 않는다 */
  assert.deepEqual(
    buildTownCategorySubs({
      counts: { applyOpen: 0, onbidActive: null, supplyMonth: 3, supplyYm: null, redevZones: NaN },
      weekPosts: -1,
    }),
    {},
  );
  assert.deepEqual(buildTownCategorySubs({ counts: null }), {});
  /* 입주 달은 supplyYm(YYYYMM)의 월 — 앞자리 0 없이 */
  assert.equal(
    buildTownCategorySubs({ counts: { applyOpen: null, onbidActive: null, supplyMonth: 1, supplyYm: "202701", redevZones: null } })["/supply"],
    "1월 입주 1곳",
  );
});

test("[1012 · R2] kstDayOf·kstYmOf — 한국 날짜 기준(UTC 자정 전후가 갈린다)", () => {
  /* 2026-09-27T15:30Z = 한국 9/28 00:30 */
  assert.equal(kstDayOf(Date.UTC(2026, 8, 27, 15, 30)), "2026-09-28");
  assert.equal(kstYmOf(Date.UTC(2026, 8, 27, 15, 30)), "202609");
  assert.equal(kstYmOf(Date.UTC(2026, 8, 30, 15, 0)), "202610");
});

test("[1012 · R2] category-counts — 네 원천은 각 화면이 읽는 표 그대로 · head 집계 · 하루 캐시 · 새 뷰 없음", () => {
  const code = stripComments(read("lib/town/category-counts.ts"));
  assert.match(code, /^import "server-only";/m);
  for (const table of ["applyhome_announcements", "apartment_supply", "redevelopment_projects"]) {
    assert.match(code, new RegExp(`\\.from\\("${table}"\\)\\s*\\.select\\("\\*", \\{ count: "exact", head: true \\}\\)`), table);
  }
  assert.match(code, /getActiveAuctionCount\(\)/, "공매는 /auctions 히어로와 같은 함수(같은 필터)");
  assert.match(code, /\.lte\("rcept_bgnde", today\)\s*\.gte\("rcept_endde", today\)/, "청약 = 오늘이 접수 기간 안");
  assert.match(code, /\.eq\("move_in_ym", ym\)/, "입주 = 이번 달");
  assert.match(code, /revalidate: 86_400/);
  assert.match(code, /tags: \[CACHE_TAGS\.market, CACHE_TAGS\.supply, CACHE_TAGS\.news\]/);
  assert.doesNotMatch(code, /\.rpc\(|create view|_source"\)/, "새 뷰·RPC 없음");
});

test("[1012 · R2] journeyCountLabels — 실데이터가 있는 카드에만 숫자, 카탈로그엔 정적 count 없음", () => {
  const labels = journeyCountLabels({
    quizRounds: 10,
    regionCount: 218,
    latestYm: "202608",
    imjangRegions: 48,
    glossaryTerms: 56,
    brokerageBrackets: 6,
    loanRulesCheckedAt: "2026-09-21",
  });
  assert.deepEqual(labels.tasks, {
    "/quiz": "오늘 10문제",
    "/map": "218개 시군구",
    "/glossary": "용어 56개",
    "/imjang": "가이드 48곳",
    "/calculator/brokerage": "요율 구간 6개",
    "/calculator": "규정 2026.09 확인",
  });
  assert.deepEqual(labels.stages, { market: "국토교통부 2026.08 신고분까지" });
  /* 모든 키는 여정 카드의 href 다 */
  const hrefs = new Set(JOURNEY_STAGES.flatMap((s) => s.tasks.map((t) => t.href)));
  for (const k of Object.keys(labels.tasks)) assert.ok(hrefs.has(k), k);
  /* 실패(null)·0·형식 불일치는 비운다 */
  const empty = journeyCountLabels({
    quizRounds: null,
    regionCount: 0,
    latestYm: "2026-08",
    imjangRegions: null,
    glossaryTerms: null,
    brokerageBrackets: null,
    loanRulesCheckedAt: "26.09",
  });
  assert.deepEqual(empty, { tasks: {}, stages: {} });
  /* 카탈로그에는 정적 숫자를 박지 않는다 */
  for (const s of JOURNEY_STAGES) for (const t of s.tasks) assert.equal(t.count, undefined, `${t.href} 에 정적 count`);
});

