/* [1012] 홈·공용 부품 — "AI 가 만든 사이트" 신호 걷어내기(docs/design-system.md v3).
   숫자는 이 파일 안에서만 쓰는 가짜 값이다(운영 데이터 아님). 소스 검사는 화면 계약(검색이 첫 요소 · 평면 헤더 ·
   실데이터 입구 · 일러스트)을 잠근다 — 값이 아니라 형태·문구 규율이 대상이다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildHomeEntries, HOME_ENTRY_MAX } from "../../lib/newui/home-entries.ts";
import { kpiRegionOf, todayRegionSentence, todayTradeSentence } from "../../app/components/home/today-line.ts";
import { homeNoteRowText, splitNoteTitle } from "../../app/components/home/home-note-title.ts";
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

test("buildHomeEntries — 전부 없으면 빈 배열(가짜 행·'—' 채움 없음)", () => {
  assert.deepEqual(buildHomeEntries({ coverage: EMPTY_COVERAGE, temp: null }), []);
  /* 0 은 없는 것과 같다 — "실거래 0건"·"도구 0종"은 정보가 아니라 빈 방 안내다. 미연동 기준금리("—")도 행이 아니다 */
  assert.deepEqual(
    buildHomeEntries({
      coverage: { txCount: 0, complexCount: 0, regionCount: 0 },
      temp: null,
      baseRate: "—",
      loanRate: "3.62%",
      aiTools: 0,
    }),
    [],
  );
});

test("buildHomeEntries — 커버리지·온도·금리·AI 행: 이름 / 오른쪽 숫자 / 보조 한 줄, 순서, 최대 4행", () => {
  const rows = buildHomeEntries({
    coverage: { txCount: 783748, complexCount: 21309, regionCount: 218 },
    temp: { score: 61, headline: "거래 회복 중", weekLabel: "9.22 주", regionLabel: "서울 강남구" },
    baseRate: "2.50%",
    loanRate: "3.62%",
    loanRateAsOf: "2026-08",
    aiTools: 12,
  });
  assert.deepEqual(
    rows.map((r) => r.key),
    ["coverage", "temp", "rate", "ai"],
  );
  assert.equal(rows.length, HOME_ENTRY_MAX);
  assert.deepEqual(
    rows.map((r) => [r.label, r.value, r.meta, r.href]),
    [
      ["국토교통부 실거래", "783,748건", "전국 218개 시군구 · 단지 21,309곳", "/tx"],
      ["이번 주 시장 온도", "61점", "서울 강남구 · 9.22 주 · 거래 회복 중", "/analysis/temperature"],
      /* 시나리오 계산은 분석 허브에서 빠졌다 — 홈의 이 행이 입구다(app/analysis/tool-catalog 머리 주석) */
      ["기준금리", "2.50%", "주담대 변동 3.62%부터 · 2026.08", "/analysis/scenario"],
      ["AI 단지 분석", "12종", "국토교통부 실거래·한국부동산원 통계 기준", "/analysis"],
    ],
  );
  /* 폰 한 줄 — 이름 ≤ 12자 · 보조 줄 ≤ 26자(12px 글자 · 폰 레이아웃 520px 에서 오른쪽 숫자 열을 빼고 한 줄) */
  for (const r of rows) {
    assert.ok(r.label.length <= 12, `${r.key} 이름 ${r.label.length}자`);
    assert.ok(r.meta.length <= 26, `${r.key} 보조 ${r.meta.length}자`);
  }
  /* [v4 · 규칙 8] 아래 섹션과 같은 숫자인 지역 거래·공개 노트 행은 입구 목록에 없다 */
  assert.ok(!rows.some((r) => /region|notes/.test(r.key)));
});

test("buildHomeEntries — 곁값이 없으면 그 조각만 빠진다(지어내지 않는다)", () => {
  /* 커버리지는 실거래 건수가 있어야 행이 된다 — 단지 수만으로는 만들지 않는다 */
  assert.equal(buildHomeEntries({ coverage: { txCount: null, complexCount: 5, regionCount: null }, temp: null }).length, 0);
  const [cov] = buildHomeEntries({ coverage: { txCount: 10, complexCount: null, regionCount: null }, temp: null });
  assert.equal(cov.meta, "신고분 기준");
  /* 온도 지역을 모르면 주·헤드라인만 */
  const [temp] = buildHomeEntries({ coverage: EMPTY_COVERAGE, temp: { score: 45, headline: "방향성 탐색 구간", weekLabel: "9.21 주" } });
  assert.equal(temp.meta, "9.21 주 · 방향성 탐색 구간");
  /* 주담대 공시가 없으면 기준금리 출처만 · 공시 달 형식이 아니면 달을 붙이지 않는다 */
  const [rateOnly] = buildHomeEntries({ coverage: EMPTY_COVERAGE, temp: null, baseRate: "2.50%" });
  assert.equal(rateOnly.meta, "한국은행");
  const [rateNoAsOf] = buildHomeEntries({ coverage: EMPTY_COVERAGE, temp: null, baseRate: "2.50%", loanRate: "3.62%", loanRateAsOf: "최근" });
  assert.equal(rateNoAsOf.meta, "주담대 변동 3.62%부터");
});

/* ───────────────────────── 1-2. 지역 행·노트 행의 글 — 한 줄로 끝나게 ───────────────────────── */

test("[v4] 지역 행 — 카드 → 문장 재료(kpiRegionOf): 건수·등락의 제 달, 가격 원천을 그대로 넘긴다", () => {
  const k = kpiRegionOf(region());
  assert.equal(k.tradeLabel, "1,204건");
  assert.equal(k.priceKind, "reb");
  assert.equal(k.changeYm, "202608");
  /* 행의 접근성 이름 = 옛 "오늘의 한 줄" 문장(기준·달을 온전히) */
  assert.equal(todayRegionSentence(k), "강남구 8월 아파트 평균은 32.5억, 시세 지수는 전월보다 0.6% 올랐어요.");
  assert.equal(todayTradeSentence(k), "강남구 7월 아파트 매매 거래는 1,204건이에요(한국부동산원 집계).");
  /* 월 집계 폴백(stale)은 국토부 실거래 평균 · 건수 0 은 건수가 아니다 */
  const s = kpiRegionOf(region({ stale: true, trades: 0 }));
  assert.equal(s.priceKind, "molit");
  assert.equal(s.tradeLabel, null);
});

test("[v4] 노트 행 — 제목은 노트 제목만(단지명은 메타), Lab 카드의 괄호 부연은 뗀다", () => {
  assert.deepEqual(splitNoteTitle("청량리역 한양수자인 그라시엘 — 그라시엘 전세10억3건 월세71%(Lab #33)"), {
    apt: "청량리역 한양수자인 그라시엘",
    body: "그라시엘 전세10억3건 월세71%(Lab #33)",
  });
  assert.deepEqual(homeNoteRowText("청량리역 한양수자인 그라시엘 — 그라시엘 전세10억3건 월세71%(Lab #33)", "lab"), {
    label: "그라시엘 전세10억3건 월세71%",
    meta: "청량리역 한양수자인 그라시엘 · 내집나우 Lab",
  });
  assert.deepEqual(homeNoteRowText("수원역푸르지오자이 상승률 13위(Lab #32)", "lab"), {
    label: "수원역푸르지오자이 상승률 13위",
    meta: "내집나우 Lab",
  });
  /* 사람이 쓴 글의 괄호는 뜻일 수 있어 그대로 */
  assert.deepEqual(homeNoteRowText("잠실엘스 — 주말 임장(비 옴)", "user"), { label: "주말 임장(비 옴)", meta: "잠실엘스 · 이웃" });
  /* " — " 가 없거나 한쪽이 비면 원문 그대로 */
  assert.deepEqual(splitNoteTitle("헬리오시티 첫 방문"), { apt: null, body: "헬리오시티 첫 방문" });
  assert.deepEqual(splitNoteTitle(" — 제목"), { apt: null, body: "— 제목" });
});

/* ───────────────────────── 2. 홈 첫 화면 — 검색이 주인공, 나머지는 구분선 목록 ───────────────────────── */

const HOME_PARTS = [
  "app/page.tsx",
  "app/components/home/HomeHeroSearch.tsx",
  "app/components/home/HomeEntryList.tsx",
  "app/components/home/HomeRows.tsx",
  "app/components/home/HomeNotesList.tsx",
  "app/components/home/HomeRegionTrend.tsx",
  "app/components/home/HomeMyRegionRow.tsx",
  "app/components/home/HomeTownBlock.tsx",
  "app/components/home/HomeDataSources.tsx",
];

test("홈 — 검색이 첫 요소 · 부제 문단 없음 · 실데이터 입구 목록 · 예산 칩·문 넷 없음", () => {
  const page = stripComments(read("app/page.tsx"));
  /* [v4] 순서 = 검색 → 입구 목록 → 공개 임장노트 → 지역 동향 → 동네 소식 → 데이터 출처(예전: … → 오늘의 한 줄 배너) */
  const order = [
    "<HomeHeroSearch",
    "<HomeEntryList entries={homeEntries} />",
    "<HomeNotesList",
    "<HomeRegionTrend",
    "<HomeTownBlock",
    "<HomeDataSources",
  ].map((s) => page.indexOf(s));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), `순서 ${order.join(",")}`);
  /* 검색 위에는 질문 한 줄(<p>)뿐 — 중앙 정렬 슬로건(t-display)·부제(HOME_HERO_SUBLINE)는 없다 */
  assert.doesNotMatch(page, /t-display/);
  assert.doesNotMatch(page, /HOME_HERO_SUBLINE|어느 단지가 궁금하세요/);
  assert.match(page, /HOME_HERO_QUESTION/);
  assert.doesNotMatch(page, /HomeStartDoors|HomeBudgetChips|HomeCoverageLine|HOME_AI_GATEWAY_LEAD|HOME_AI_EXAMPLE_LINE/);
  assert.doesNotMatch(page, /text-center t-(display|sub)/);
  /* 굵기 800 이상 없음(규칙 8) */
  assert.doesNotMatch(page, /font-extrabold|font-black/);
  /* 입구 목록은 서버 조각 — 첫 화면은 정적. [v4] 1px 구분선 행(md 2열 격자·data-cols 없음) */
  const list = read("app/components/home/HomeEntryList.tsx");
  assert.doesNotMatch(list, /"use client"/);
  /* [v4.1 · 리퀴드 목록] 묶음 톤(data-tone)은 붙어도 된다 — 행 구조는 그대로 */
  assert.match(list, /<ul (?:data-tone="[a-z]+" )?className=\{HOME_LIST\}>/);
  assert.doesNotMatch(stripComments(list), /data-cols|grid-cols|shadow/);
  assert.match(read("app/components/home/HomeRows.tsx"), /HOME_LIST = "card flex flex-col divide-y divide-line rounded-lg px-4"/);
  /* 옛 문 넷의 카피는 남지 않았다 */
  const copy = stripComments(read("lib/brand/home-copy.ts"));
  assert.doesNotMatch(copy, /HOME_START_DOORS|어디서부터 시작할까요/);
  assert.equal((copy.match(/시작하기|시작하세요|무료로 시작/g) ?? []).length, 0);
});

test("[v4] 홈 — 가운데 한 줄 · 네이비 배너/패널·회전 점·하우스 광고·사이드바 없음 · 채움 파랑 1개", () => {
  const page = stripComments(read("app/page.tsx"));
  assert.match(page, /mx-auto flex w-full max-w-\[760px\] flex-col gap-8/);
  assert.doesNotMatch(page, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]|<aside/);
  assert.doesNotMatch(page, /<AdZone|<AIPanel|<HomeTodayLine|<RegionPulseCards|<EmptyState|<ErrorState|<Explain/);
  let primary = 0;
  for (const f of HOME_PARTS) {
    const src = stripComments(read(f));
    assert.doesNotMatch(src, /brand-navy-card|brand-wm|role="tablist"|aria-roledescription/, `${f}: 네이비·회전`);
    assert.doesNotMatch(src, /"Lab 데이터"|"대표 지역"|자동 수집 · 최신/, `${f}: 설명 배지`);
    assert.doesNotMatch(src, /story-avatar|news-strip|rounded-xl bg-primary-soft/, `${f}: 두 재질 카드·아이콘 타일`);
    primary += (src.match(/\bbtn-primary\b/g) ?? []).length;
  }
  assert.equal(primary, 1, "채움 파랑 = 검색 버튼 하나");
  assert.match(read("app/components/home/HomeHeroSearch.tsx"), /btn-primary press/);
  /* 옛 컴포넌트 파일은 지웠다(홈 전용 · 사용처 0) */
  for (const gone of ["HomeTodayLine", "RegionPulseCards", "HomeMyRail"]) {
    assert.throws(() => statSync(path.join(ROOT, `app/components/home/${gone}.tsx`)), gone);
  }
});

test("[v4] 홈 섹션 — 행 목록 · 숫자 오른쪽 · 빈 상태 한 줄 · 출처는 맨 끝 접힘 하나", () => {
  const rows = stripComments(read("app/components/home/HomeRows.tsx"));
  /* 행 = 이름 한 줄(truncate) + 보조 한 줄 / 오른쪽 t-num */
  assert.match(rows, /"truncate t-body font-bold text-ink"/);
  assert.match(rows, /muted \? "truncate t-body text-text-3"/); // 빈 상태·실패 한 줄은 흐린 글자
  assert.match(rows, /className="truncate t-sub text-text-3"/);
  assert.match(rows, /className="t-body t-num text-ink"/);
  assert.match(rows, /h-\[72px\] w-\[72px\]/); // FeedRow 와 같은 썸네일 칸(커버가 올 때만)
  /* 지역 행의 접근성 이름 = 옛 오늘의 한 줄 문장(기준·달) */
  assert.match(rows, /todayRegionSentence\(kpi\)/);
  assert.match(rows, /<Delta pct=\{pct\} \/>/);
  /* 노트 — 점수 배지·ⓘ 대신 오른쪽 숫자, AI 입구는 목록 끝 행 */
  const notes = stripComments(read("app/components/home/HomeNotesList.tsx"));
  assert.match(notes, /homeNoteRowText\(n\.title, n\.kind\)/);
  assert.match(notes, /<HomeRow href=\{cta\.href\} label=\{cta\.label\} \/>/);
  assert.match(stripComments(read("app/page.tsx")), /cta=\{HOME_CTA_AI\}/);
  /* 지역 — 로그인 관심지역 행(클라이언트)은 목록 안, 서버 HTML 에는 없다 · 관심지역 설정 링크는 끝 캡션 */
  const region = stripComments(read("app/components/home/HomeRegionTrend.tsx"));
  assert.doesNotMatch(region, /"use client"/);
  assert.match(region, /<HomeMyRegionRow shownIds=/);
  assert.match(region, /href="\/my\/settings#region"/);
  assert.match(read("app/components/home/HomeMyRegionRow.tsx"), /^"use client";/);
  /* 출처 — 페이지 맨 끝 <details> 하나 */
  const src = stripComments(read("app/components/home/HomeDataSources.tsx"));
  assert.match(src, /<details className="group border-t border-line pt-1">/);
  assert.match(src, /데이터 출처/);
  assert.match(src, /임장 점수/);
});

test("홈 검색 — 왼쪽 정렬 · 1px 선 · 그림자 없음 · 이모지 없음", () => {
  const src = stripComments(read("app/components/home/HomeHeroSearch.tsx"));
  assert.doesNotMatch(src, /mx-auto/);
  assert.doesNotMatch(src, /shadow-\[|shadow-sm|hover:-translate-y/);
  assert.doesNotMatch(src, /border-2 border-primary/);
  assert.match(src, /rounded-lg border border-line-strong bg-surface/);
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u);
  assert.doesNotMatch(src, /coverage/);
  /* [v4 · 규칙 6·8] 칩(알약 + 아이콘) → 검색 아래 글자 링크 한 줄. 지역 바로 보기 칩은 지역 동향 행과 같은 주소라 뺐다 */
  assert.doesNotMatch(src, /className="chip|regionChips|지역 바로 보기/);
  assert.match(src, /지도에서 내 동네 찾기 ›/);
  assert.match(src, /overflow-x-auto whitespace-nowrap/);
  assert.doesNotMatch(stripComments(read("app/page.tsx")), /regionChips/);
});

/* ───────────────────────── 3. 헤더·탭바 — 평면 ───────────────────────── */

test("헤더 — 화면 폭 전체 흰 면 + 아래 1px 선, 유리·알약·스크롤 축소 없음", () => {
  const src = stripComments(read("app/components/Header.tsx"));
  assert.match(src, /<header\s+className="sticky top-0 z-50 border-b border-line bg-surface/);
  assert.doesNotMatch(src, /\bglass(-strong)?\b|header-scrolled|useScrolledPast|rounded-2xl|max-w-\[1240px\] items-center gap-2 rounded/);
  assert.doesNotMatch(src, /hover:\[box-shadow:var\(--shadow-glow\)\]|hover:-translate-y/);
  /* 로고·메뉴·검색·CTA 배치는 그대로 */
  for (const piece of ["<Logo />", "<HeaderSearch />", "<NotificationBell variant=\"desktop\" />", "노트 쓰기", "<HeaderAuth />", "<MobileMenu />"]) {
    assert.ok(src.includes(piece), piece);
  }
});

test("탭바 — 바닥에 붙은 전폭 흰 면 + 위 1px 선, 유리·알약·큰 그림자 없음", () => {
  const src = stripComments(read("app/components/TabBar.tsx"));
  assert.match(src, /fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/);
  assert.doesNotMatch(src, /\bglass(-strong)?\b|rounded-3xl|shadow-\[|opacity-85|w-\[min\(420px/);
  assert.doesNotMatch(src, /font-extrabold/);
});

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
  assert.match(login, /label: "저장"/);
  assert.match(login, /label: "알림"/);
});

/* ───────────────────────── 5. 금지 문구·이모지 — 담당 경로 0건 ───────────────────────── */

test("담당 경로 — 금지 문구·이모지·유리 클래스 0건", () => {
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
    assert.ok(!/className="[^"]*\bglass(-strong)?\b/.test(src), `${rel}: .glass`);
    assert.ok(!/font-extrabold|font-black/.test(src), `${rel}: 굵기 800+`);
  }
});

/* ───────────────────────── 6. 문구 — CTA 동사+대상 ───────────────────────── */

test("가입·온보딩·랜딩 CTA — 동사 + 구체 대상", () => {
  assert.match(read("app/signup/SignupClient.tsx"), /"가입하고 노트 쓰기"/);
  assert.match(read("app/welcome/page.tsx"), /title: "관심 지역 고르기 \| 내집나우"/);
  assert.match(read("app/lp/imjang/page.tsx"), /const CTA_LABEL = "첫 임장노트 쓰기\(무료\)"/);
  assert.match(read("app/lp/imjang/page.tsx"), /variant="outline"/);
  assert.match(read("app/components/CoachmarkTour.tsx"), /"둘러보기 마치기"/);
  assert.doesNotMatch(stripComments(read("app/layout.tsx")), /시작하세요/);
  assert.match(read("lib/brand/home-copy.ts"), /label: "임장노트 쓰고 AI 정리 받기"/);
});
