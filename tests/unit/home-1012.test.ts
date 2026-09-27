/* [1012] 홈·공용 부품 — "AI 가 만든 사이트" 신호 걷어내기(docs/design-system.md v3).
   숫자는 이 파일 안에서만 쓰는 가짜 값이다(운영 데이터 아님). 소스 검사는 화면 계약(검색이 첫 요소 · 평면 헤더 ·
   실데이터 입구 · 일러스트)을 잠근다 — 값이 아니라 형태·문구 규율이 대상이다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { ILLUST_NAMES, illustSrc } from "../../app/components/illust-names.ts";
import type { HomeRegionCard } from "../../lib/newui/home-data.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
/** 주석은 코드가 아니다 — 규칙을 설명한 문장 안의 낱말을 위반으로 세지 않는다 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const EMPTY_COVERAGE = { txCount: null, complexCount: null, regionCount: null };

function region(over: Partial<HomeRegionCard> = {}): HomeRegionCard {
  return {
    id: "gangnam",
    name: "강남구",
    meta: "서울 (8월)",
    periodLabel: "8월",
    price: "32.5억",
    delta: "▲ 0.6%",
    tone: "up",
    href: "/map?region=%EA%B0%95%EB%82%A8%EA%B5%AC",
    spark: [],
    city: "서울",
    trades: 1204,
    tradesYm: "202607",
    tradesSource: "reb",
    changePct: 0.6,
    changeBasis: "index",
    changeYm: "202608",
    ...over,
  };
}

/* ───────────────────────── 1. 실데이터 입구 목록 — 값이 없으면 행이 빠진다 ───────────────────────── */
/* [v4 · 한 화면 한 가지] 행 = 왼쪽 이름 + 보조 한 줄 / 오른쪽 숫자(value). 지역 거래·공개 노트 행은 바로 아래 섹션
   ("공개 임장노트"·"지역 동향")과 같은 숫자라 뺐고(규칙 8), 걷힌 회전 배너·AI 패널에만 있던 기준금리·AI 단지 분석이
   행이 됐다. 예전 테스트의 지역 행 문장("강남구 7월 거래 1,204건")은 지역 동향 행의 계약(아래 2절 소스 검사 ·
   kpiRegionOf/todayTradeSentence)으로 옮겼다. */

test("홈 검색 — 이모지 없음 ([1014] 왼쪽 정렬·1px 선 검사는 뺐다 — 개편(v4) 전 가운데 검색 상자가 돌아왔다)", () => {
  const src = stripComments(read("app/components/home/HomeHeroSearch.tsx"));
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u);
});

/* ───────────────────────── 3. 헤더·탭바 — 평면 ───────────────────────── */

test("계정 배지 — 반짝이(✦) 없이 명사만 · 연한 배경 + 진한 글자", () => {
  const src = stripComments(read("app/components/HeaderAuth.tsx"));
  assert.doesNotMatch(src, /✦/);
  /* [1012 통합] 플랜 이름 리터럴은 check:plan-labels 가 막는다 — 이름은 planBadgeLabel 단일 출처 */
  assert.match(src, /planBadgeLabel\(/);
  assert.doesNotMatch(src, /pro: "플러스"/);
  assert.match(src, /"관리자"/);
  assert.doesNotMatch(src, /glass-strong|rgba\(25,31,40/);
});

/* ───────────────────────── 4. 일러스트 — 직접 그린 선화 8종 ───────────────────────── */

test("일러스트 — 8종 · ≤2KB · viewBox 120×90 · 브랜드 3색 + 선 1.8 · 얼굴·사람 없음", () => {
  assert.equal(ILLUST_NAMES.length, 8);
  const dir = path.join(ROOT, "public/illust");
  const onDisk = readdirSync(dir).filter((f) => f.endsWith(".svg")).sort();
  assert.deepEqual(onDisk, [...ILLUST_NAMES].map((n) => `${n}.svg`).sort());
  for (const name of ILLUST_NAMES) {
    const file = path.join(dir, `${name}.svg`);
    assert.ok(statSync(file).size <= 2048, `${name}.svg 2KB 초과`);
    const svg = readFileSync(file, "utf8");
    assert.match(svg, /viewBox="0 0 120 90"/, name);
    assert.match(svg, /stroke-width="1\.8"/, name);
    /* 색은 브랜드 3색뿐 */
    const colors = new Set((svg.match(/#[0-9a-fA-F]{6}/g) ?? []).map((c) => c.toUpperCase()));
    for (const c of colors) assert.ok(["#0B2545", "#F6F1E7", "#C8442B"].includes(c), `${name}: ${c}`);
    assert.doesNotMatch(svg, /<image|<text|face|eye|mouth/i, name);
    assert.equal(illustSrc(name), `/illust/${name}.svg`);
  }
  /* 컴포넌트는 next/image 없이 <img alt="" aria-hidden> */
  const comp = stripComments(read("app/components/Illust.tsx"));
  assert.doesNotMatch(comp, /next\/image/);
  assert.match(comp, /<img/);
  assert.match(comp, /alt=""/);
  assert.match(comp, /aria-hidden="true"/);
});

test("일러스트를 쓰는 자리 — 빈 화면·오프라인·설치 안내에 이모지가 남지 않았다", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}]/u;
  const empty = stripComments(read("app/components/ui/EmptyState.tsx"));
  assert.match(empty, /<Illust name=\{picture\}/);
  assert.match(empty, /"notebook-pen": "empty-notes"/);
  const install = stripComments(read("app/components/InstallPrompt.tsx"));
  assert.match(install, /<Illust name="key-door"/);
  assert.doesNotMatch(install, emoji);
  /* 오프라인 문서는 번들 없이 뜨므로 SVG 를 인라인 — public/illust/offline.svg 와 같은 경로 데이터 */
  const offline = read("app/offline/page.tsx");
  assert.doesNotMatch(stripComments(offline), emoji);
  const svg = read("public/illust/offline.svg");
  for (const d of svg.match(/ d="[^"]+"/g) ?? []) {
    assert.ok(offline.includes(d), `offline 인라인 SVG 에 ${d} 가 없다`);
  }
  const login = stripComments(read("app/login/LoginClient.tsx"));
  assert.doesNotMatch(login, emoji);
  assert.match(login, /label: "임장노트 저장"/);
  assert.match(login, /label: "관심 지역 알림"/);
});

/* ───────────────────────── 5. 금지 문구·이모지 — 담당 경로 0건 ───────────────────────── */

test("담당 경로 — 금지 문구·이모지 0건", () => {
  const banned = ["지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로"];
  const emoji = /[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}]|[\u{2728}\u{2B50}\u{2705}\u{274C}\u{2757}]/u;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx$/.test(e.name)) files.push(p);
    }
  };
  for (const d of ["app/components", "app/login", "app/signup", "app/welcome", "app/offline", "app/forgot-password", "app/lp", "app/search"] /* [1012 통합] api/screenshot 라우트는 미사용이라 삭제됨 */) {
    walk(path.join(ROOT, d));
  }
  files.push(path.join(ROOT, "app/page.tsx"), path.join(ROOT, "app/layout.tsx"));
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const src = stripComments(readFileSync(f, "utf8")).replace(/name=\{?"[^"]*"\}?/g, "");
    if (rel === "app/components/Icon.tsx") continue; // 이모지 → 아이콘 매핑표
    for (const ph of banned) assert.ok(!src.includes(ph), `${rel}: "${ph}"`);
    assert.ok(!emoji.test(src), `${rel}: 이모지`);
    /* [1014] 유리(.glass) 검사는 뺐다 — 주인님이 개편 전 리퀴드 유리 헤더·탭바를 되살리라 했다 */
    assert.ok(!/font-extrabold|font-black/.test(src), `${rel}: 굵기 800+`);
  }
});

/* ───────────────────────── 6. 문구 — CTA 동사+대상 ───────────────────────── */

test("가입·온보딩·랜딩 CTA — 동사 + 구체 대상", () => {
  assert.match(read("app/signup/SignupClient.tsx"), /"가입하고 노트 쓰기"/);
  assert.match(read("app/welcome/page.tsx"), /title: "관심 지역 고르기 \| 내집나우"/);
  assert.match(read("app/lp/imjang/page.tsx"), /const CTA_LABEL = "첫 임장노트 쓰기\(무료\)"/);
  assert.match(read("app/components/CoachmarkTour.tsx"), /"둘러보기 마치기"/);
  assert.doesNotMatch(stripComments(read("app/layout.tsx")), /시작하세요/);
});
