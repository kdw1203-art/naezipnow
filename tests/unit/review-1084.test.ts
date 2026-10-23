/* [1084] 소유자 2026-10-21 — "대규모 개선" 2단계: 화면 사용성·문구 전수.
 *  데스크톱 감사 82건(/analysis · /complex · /calculator · /reports · /supply · /auctions · /map …) + 폰(390px) 48쪽 실측에서 나온 것 중
 *  코드로 고칠 수 있는 것. 조사 템플릿 "이(가)" · 지도 라벨 겹침(idle 미발생) · 잘린 칩 줄 · 0원 결과 · 해라체/구어 · 정렬 어긋남 · 폰 탭 높이. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finalJong, josa, withJosa } from "@/lib/format/josa";
import { EXACT_REDIRECTS } from "@/lib/seo/redirect-map";
import { NOTE_STEPS } from "@/lib/notes/form-steps";
import { IMJANG_CHECKPOINTS } from "@/lib/imjang/checkpoints";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("조사 — 받침(한글 · 숫자 · 영문 이름) · ㄹ 받침 + 으로/로 · 끝 괄호·따옴표는 건너뛴다", () => {
  assert.equal(withJosa("도곡렉슬", "이/가"), "도곡렉슬이");
  assert.equal(withJosa("남양주시", "이/가"), "남양주시가");
  assert.equal(withJosa("리센츠(잠실)", "이/가"), "리센츠(잠실)이");
  assert.equal(withJosa("‘강남 보고서’", "이/가"), "‘강남 보고서’가");
  assert.equal(josa("11억", "으로/로"), "으로");
  assert.equal(josa("9억 5,000만원", "으로/로"), "으로");
  assert.equal(josa("서울", "으로/로"), "로", "ㄹ 받침은 '로'");
  assert.equal(josa("2.9억", "으로/로"), "으로");
  assert.equal(josa("1", "으로/로"), "로", "1(일) = ㄹ 받침");
  assert.equal(josa("3", "이/가"), "이", "3(삼)");
  assert.equal(josa("2", "이/가"), "가", "2(이)");
  assert.equal(josa("KTX", "이/가"), "가");
  assert.equal(josa("LH", "은/는"), "는");
  assert.equal(josa("BTL", "이/가"), "이", "L(엘)");
  assert.equal(josa("단지", "와/과"), "와");
  assert.equal(josa("아파트 단지들", "을/를"), "을");
  assert.equal(finalJong(""), 0);
  assert.equal(finalJong("()"), 0);
});

test("조사 — 템플릿 '이(가)'·'(으)로' 를 쓰던 자리가 josa 를 부른다", () => {
  const sites: Array<[string, RegExp]> = [
    ["app/imjang/[slug]/page.tsx", /withJosa\(top\.name, "이\/가"\)/],
    ["app/reports/[ym]/page.tsx", /withJosa\(top\.regionName, "이\/가"\)/],
    ["app/api/cron/price-alerts/route.ts", /withJosa\(priceText\([^)]*\), "으로\/로"\)/],
    ["app/api/creator/reports/[id]/buy/route.ts", /josa\(report\.title, "이\/가"\)/],
  ];
  for (const [p, re] of sites) {
    const src = strip(read(p));
    assert.match(src, re, p);
    assert.doesNotMatch(src, /이\(가\)|\(으\)로|을\(를\)/, `${p}: 템플릿 조사 잔여`);
  }
  for (const p of ["app/analysis/ai/[tool]/WorkbenchClient.tsx", "app/analysis/compare/page.tsx", "lib/reengagement/candidates.ts"]) {
    const src = strip(read(p));
    assert.match(src, /from "@\/lib\/format\/josa"/, p);
    assert.doesNotMatch(src, /이\(가\)|\(으\)로|을\(를\)/, p);
  }
});

test("지도 — 라벨 솎기(declutter)가 idle 이벤트 없이도 화면 범위를 받는다 · 늦은 SDK 감시 10초 · 실패 문장", () => {
  const src = strip(read("components/map/NaverMap.tsx"));
  assert.match(src, /const updateView = \(\) => \{/);
  assert.match(src, /const viewTimers = \[window\.setTimeout\(updateView, 0\), window\.setTimeout\(updateView, 800\)\];/, "첫 그리기 직후 두 번");
  assert.match(src, /maps\.Event\.addListener\(map, "dragend", settle\);/);
  assert.match(src, /maps\.Event\.addListener\(map, "zoom_changed", settle\);/);
  assert.match(src, /new ResizeObserver\(settle\)/);
  assert.match(src, /for \(const t of viewTimers\) window\.clearTimeout\(t\);/, "정리");
  assert.match(src, /\}, 10_000\);/);
  assert.match(read("components/map/NaverMap.tsx"), /지도 불러오기 실패 · 잠시 후 다시 시도해 주세요\./);
  /* 범위가 상태에 들어오면 헤더 칩이 "단지 10 · 거래 340,753건"으로 길어져 검색 칸을 밀었다(운영 재현) — 칩은 단지 수만, 전체는 풍선 도움말 */
  const mc = strip(read("app/map/map-client.tsx"));
  assert.match(mc, /title=\{viewportCountLabel\(filteredDanji\.length, priceMeta\.txCount, danjiLoadFailed\)\}>\s*\{viewportCountLabel\(filteredDanji\.length, 0, danjiLoadFailed\)\}/);
});

test("막다른 길 — /analysis/ai(하위 도구만 있는 상위 경로) → /analysis", () => {
  assert.equal(EXACT_REDIRECTS["/analysis/ai"], "/analysis");
  assert.equal(EXACT_REDIRECTS["/analysis/ai/ai-diagnosis"], undefined, "하위 도구는 그대로");
});

test("긴 표 — 월간 리포트 30행 + 접힌 나머지 · 입주 물량 앞으로 올 입주부터 40행", () => {
  const rep = strip(read("app/reports/[ym]/page.tsx"));
  assert.match(rep, /const REPORT_TABLE_HEAD = 30;/);
  assert.match(rep, /report\.rows\.slice\(0, REPORT_TABLE_HEAD\)\.map\(\(r\) => regionRow\(r\)\)/);
  assert.match(rep, /나머지 \{[^}]+\}개 지역 보기/);
  const sup = strip(read("app/supply/SupplyClient.tsx"));
  assert.match(sup, /const TABLE_INITIAL_ROWS = 40;/);
  assert.match(sup, /String\(s\.moveInYm\) >= nowYmKey\),\s*\.\.\.list\.filter\(\(s\) => validYm\(s\.moveInYm\) && String\(s\.moveInYm\) < nowYmKey\)\.reverse\(\)/, "앞으로 올 입주(가까운 순) → 지난 입주(최근 순)");
  assert.match(sup, /tableOrdered\.slice\(0, TABLE_INITIAL_ROWS\)/);
});

test("수의 일관성 — 실거래 구간 단지 수는 구간 중 최댓값(하한) + '이상' · 시장 타일 출처 표기", () => {
  assert.match(strip(read("lib/market/tx-bands.ts")), /r\.complexCount = Math\.max\(r\.complexCount, c\.complexCount\)/);
  assert.match(read("app/tx/[region]/page.tsx"), /곳 이상/);
  assert.match(strip(read("app/town/[region]/page.tsx")), /부동산원|KB|통계청/);
});

test("계산기 — 칩 줄 흐림(HScroll) · 단독 쪽 제목 번호 없음 · 입력 전 결과 '—' · 금리 빈 상태 '○○ 없음' · 왼쪽 정렬", () => {
  const nav = strip(read("app/calculator/CalculatorNav.tsx"));
  assert.match(nav, /<HScroll hint=\{null\} className="mb-4">/);
  const tools = strip(read("app/calculator/realestate-tools.tsx"));
  for (const t of ["전월세 전환", "갭 · 전세가율", "임대수익률"]) assert.match(tools, new RegExp(`<ToolCard title="${t}"`), t);
  assert.doesNotMatch(tools, /title="\d\. /);
  assert.match(tools, /toWolseSentence === null \? "—" : <TweenMoney/);
  assert.match(tools, /toJeonseSentence === null \? "—" : <TweenMoney/);
  assert.match(tools, /conclusion === null \? "—" : <TweenMoney value=\{gap\} \/>/);
  assert.match(tools, /value=\{priceN > 0 \? manwonText\(priceN\) : "—"\}/, "보조 행도 넣기 전엔 —");
  assert.match(tools, /value=\{toWolseSentence === null \? "—" : manwonText\(gapToConvert\)\}/);
  const calc = strip(read("app/calculator/calculator-client.tsx"));
  assert.match(calc, /은행별 공시 금리 없음/);
  assert.doesNotMatch(calc, /<EmptyState/);
  assert.match(strip(read("app/calculator/[tool]/page.tsx")), /<div className="w-full max-w-\[640px\]">/);
  assert.match(strip(read("app/calculator/page.tsx")), /after=\{<div className="w-full max-w-\[720px\]">/);
});

test("문구 — 해라체·구어·기호 → 사실 낱말 (가입·로그인·다이제스트·설정·갭·임장·노트 단계·가이드 제목)", () => {
  assert.match(read("app/analysis/gap/GapScreener.tsx"), /조건 = 주소\(URL\)에 저장/);
  const signup = read("app/signup/SignupClient.tsx");
  assert.match(signup, /소셜 가입 시\{" "\}/);
  assert.equal((signup.match(/<span className="whitespace-nowrap">만 14세 이상<\/span>/g) ?? []).length, 2);
  assert.match(read("app/login/LoginClient.tsx"), /<span className="whitespace-nowrap">만 14세 이상<\/span>/);
  const digest = read("app/digest/(index)/page.tsx");
  assert.match(digest, /매주 월요일 15시경 · 1회/);
  assert.match(strip(digest), /return formatKstDateTime\(iso\) \|\| "—";/, "기준 시각 = 2026.10.21 20:43 꼴");
  const settings = strip(read("app/my/settings/SettingsClient.tsx"));
  assert.doesNotMatch(settings, /15시쯤/);
  assert.match(settings, /매주 월요일 15시경 · 최근 7일/);
  for (const c of IMJANG_CHECKPOINTS) {
    assert.doesNotMatch(`${c.title} ${c.why}`, /[다요]\.?$|센다|만든다|얼굴|전쟁/, c.title);
  }
  assert.equal(IMJANG_CHECKPOINTS.length, 10);
  assert.deepEqual(NOTE_STEPS.map((s) => s.short), ["위치", "체크", "기록"]);
  const catalog = read("lib/guides/catalog.ts");
  for (const bad of ["순서 싸움", "감 잡기", "평균의 함정", "걸러라", "아직 안 보인다", "발품"]) {
    assert.doesNotMatch(catalog, new RegExp(`heading: "[^"]*${bad}`), bad);
  }
  assert.match(read("app/complex/[id]/ComplexNotesNewsAi.tsx"), /이 단지·지역 관련 기사 없음/);
});

test("배치 — KPI 칸 수만큼 열 · 아래 광고 본문 열 안 · 단지 홈 2단 · 단지 열 44% · 0 막대 없음 · 지연만 표시 · 가이드 첫 절 펼침", () => {
  const rr = strip(read("app/region/[id]/report/[ym]/page.tsx"));
  assert.match(rr, /const FACT_COLS: Record<number, string> = \{/);
  assert.match(rr, /4: "md:grid-cols-4",/);
  assert.match(rr, /\$\{FACT_COLS\[Math\.min\(facts\.length, 5\)\] \?\? "md:grid-cols-5"\}/);
  const reports = strip(read("app/reports/(index)/page.tsx"));
  assert.match(reports, /<div className="mt-6 max-md:mt-4 lg:grid lg:grid-cols-\[minmax\(0,1fr\)_340px\] lg:gap-5">\s*<AdZone placement="page_bottom" seed=\{2\} plan=\{null\} \/>/);
  const cx = strip(read("app/complex/[id]/ComplexNotesNewsAi.tsx"));
  assert.match(cx, /lg:grid-cols-2/);
  assert.doesNotMatch(cx, /lg:grid-cols-3/);
  assert.equal((cx.match(/이 단지 AI 분석 받기/g) ?? []).length, 1);
  assert.match(read("app/components/ComplexSummaryTable.tsx"), /<th className="py-2 font-medium md:w-\[44%\]">단지<\/th>/);
  assert.match(strip(read("app/components/compact/MiniBar.tsx")), /\{r\.value > 0 && \(/);
  const gs = strip(read("app/analysis/gap/GapScreener.tsx"));
  assert.match(gs, /const GAP_TABLE_PAGE = 40;/);
  assert.match(gs, /<RankTable rows=\{filtered\.slice\(0, tableShown\)\}/);
  assert.match(gs, /setTableShown\(GAP_TABLE_PAGE\);/, "조건·정렬이 바뀌면 처음 40행");
  const rank = strip(read("app/analysis/gap/RankTable.tsx"));
  assert.match(rank, /if \(n === null \|\| n <= 2\) return null;/);
  assert.doesNotMatch(rank, /return "최신"/);
  assert.match(strip(read("app/guides/[slug]/page.tsx")), /<Fineprint className="mt-1\.5" label="본문" open=\{i === 0\}>/);
  const listings = strip(read("app/listings/page.tsx"));
  assert.match(listings, /items !== null && items\.length > 0 \? " · 서울 구 단위 필터" : ""/);
  assert.match(listings, /\{items !== null && items\.length > 0 && \(\s*<Link href="\/listings\/new" className="btn-outline btn-md">/);
  const support = read("app/support/page.tsx");
  for (const href of ["/legal/terms", "/legal/location", "/legal/youth"]) {
    assert.match(support, new RegExp(`<Link href="${href}" className="inline-block py-\\[5px\\] text-text-1 hover:text-primary">`), href);
  }
  assert.match(support, /<Link href="\/legal\/privacy" className="inline-block py-\[5px\] font-bold text-text-1 hover:text-primary">/);
  for (const p of ["app/glossary/page.tsx", "app/glossary/[term]/page.tsx"]) {
    assert.doesNotMatch(read(p), /mx-auto grid max-w-\[1100px\]/, p);
  }
  for (const p of ["app/apply/calendar/page.tsx", "app/apply/calendar/[week]/page.tsx"]) {
    assert.doesNotMatch(read(p), /mx-auto grid w-full max-w-\[1080px\]/, p);
  }
  assert.match(strip(read("app/auctions/AuctionsClient.tsx")), /export function nameHasRegion\(name: string, region: string\): boolean \{/);
  assert.equal((read("app/auctions/AuctionsClient.tsx").match(/c\.region && !nameHasRegion\(c\.name, c\.region\)/g) ?? []).length, 2);
});

test("폰(390px) — 넘치는 표·칩 줄 흐림 · 단계 줄 안 넘침 · 탭 높이 40px · textarea·select 16px(iOS 확대 방지)", () => {
  assert.match(read("app/analysis/temperature/[region]/page.tsx"), /<HScroll className="relative mt-3">\s*<table className="w-full min-w-\[460px\]/);
  assert.match(read("app/redevelopment/RedevelopmentMap.tsx"), /<HScroll hint=\{null\} className="-mx-1 px-1 pb-1">/);
  assert.match(read("app/redevelopment/(index)/page.tsx"), /<HScroll hint=\{null\} className="mt-3 -mx-1 px-1 pb-1">/);
  const hs = read("app/components/HScroll.tsx");
  assert.match(hs, /hint\?: string \| null;/);
  assert.match(hs, /\{overflowing && hint !== null && \(/);
  const step = read("app/components/StepLine.tsx");
  assert.match(step, /max-md:gap-1 max-md:px-3\.5/);
  assert.match(step, /t-caption font-bold max-md:px-2/);
  const chip = /className="tile inline-flex min-h-10 items-center rounded-full border border-border px-3 py-1\.5 t-sub font-bold text-ink md:min-h-8"/g;
  assert.equal((read("app/tx/[region]/page.tsx").match(chip) ?? []).length, 1);
  assert.equal((read("app/region/[id]/page.tsx").match(chip) ?? []).length, 2);
  assert.equal((read("app/tx/[region]/[kind]/[band]/page.tsx").match(chip) ?? []).length, 2);
  assert.match(read("app/glossary/[term]/page.tsx"), /inline-flex min-h-10 items-center rounded-full border border-line bg-surface/);
  for (const p of ["app/apply/calendar/page.tsx", "app/apply/calendar/[week]/page.tsx"]) {
    assert.match(read(p), /className="flex min-h-10 items-center gap-2 rounded-xl bg-bg px-3 py-2 no-underline"/, p);
  }
  const css = read("app/globals.css");
  const tail = css.slice(css.lastIndexOf("[1084 · 폰 실측] iOS 포커스 확대 방지 보강"));
  assert.match(tail, /textarea:not\(\.nz-zoom-ok\),\s*select:not\(\.nz-zoom-ok\) \{[\s\S]*?font-size: max\(1rem, var\(--fs-body\)\);/);
  assert.match(tail, /\.news-row__title \{[\s\S]*?min-height: 40px;\s*padding-block: 8px;\s*margin-block: -8px;/);
  /* 덧붙인 블록은 토큰만 — 날 hex · 그라데이션 · 800 굵기 없음 */
  assert.doesNotMatch(tail, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8/);
});
