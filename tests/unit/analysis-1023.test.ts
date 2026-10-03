/**
 * [1023 · AI 분석] docs/review-1022.md 3장 적용 — 허브 + 도구 머리.
 *
 * ① lib/ai/history-store — 허브용 읽기(listRecentHistory · findLastRun · daysSinceRun): 저장 형식 그대로, 최신순, 같은 키는 1건.
 * ② 소스 구조 — 허브 최근 실행 결과(hub-recent) · 실행 4칸 "마지막 실행" · 시장 카드 티저 지역별(hub-region-teaser) ·
 *    "N종" 배지 앵커 · 도구 4종 + 나머지 8종 머리가 PageHead(t-display·네이비 없음) · 부연 라벨·on-dark 토큰 없음 · [region] px 없음 ·
 *    globals.css append-only 블록.
 * 클라이언트 컴포넌트는 node --test 로 실행할 수 없어 소스 문자열로 본다(기존 1021·1022 테스트와 같은 방식).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** 주석은 걷고 본다 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── ① history-store 읽기 — localStorage 흉내 ─────────────────────────────── */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

test("[1023] history-store — listRecentHistory 는 모든 키를 펼쳐 최신순 N개(같은 도구·키는 최신 1건), findLastRun 은 단지 id 로 1건, 서버(window 없음)는 빈 값", async () => {
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const store = await import("../../lib/ai/history-store.ts");
  /* 서버 — window 없음 */
  assert.deepEqual(store.listRecentHistory(3), []);
  assert.equal(store.findLastRun("ai-diagnosis", "c1"), null);

  g.window = globalThis;
  g.localStorage = fakeStorage();
  try {
    store.pushHistory({ tool: "ai-diagnosis", groupKey: "c1", score: 61, headline: "A: 평균 61점", createdAt: "2026-09-20T00:00:00Z" });
    store.pushHistory({ tool: "ai-diagnosis", groupKey: "c1", score: 64, headline: "A: 평균 64점", createdAt: "2026-09-25T00:00:00Z" });
    store.pushHistory({ tool: "ai-timing", groupKey: "강남구", score: null, oneLine: "2-1-0", createdAt: "2026-09-27T00:00:00Z" });
    store.pushHistory({ tool: "ai-diagnosis", groupKey: "c2", score: 70, headline: "B: 평균 70점", createdAt: "2026-09-10T00:00:00Z" });
    store.pushHistory({ tool: "ai-diagnosis", groupKey: "c3", score: 50, headline: "C", createdAt: "2026-09-01T00:00:00Z" });

    const recent = store.listRecentHistory(3);
    assert.deepEqual(
      recent.map((e) => [e.tool, e.groupKey, e.score]),
      [
        ["ai-timing", "강남구", null],
        ["ai-diagnosis", "c1", 64],
        ["ai-diagnosis", "c2", 70],
      ],
    );
    assert.equal(store.listRecentHistory(10).length, 4, "키 4개 → 4건(같은 키의 옛 실행은 접힌다)");
    assert.equal(store.listRecentHistory(0).length, 0);

    /* 단지 id 조회 — 최신 1건 · 없는 단지는 null · 저장 형식(도구::키)은 그대로 */
    assert.equal(store.findLastRun("ai-diagnosis", "c1")?.score, 64);
    assert.equal(store.findLastRun("ai-diagnosis", "없음"), null);
    assert.equal(store.listHistory("ai-diagnosis", "c1").length, 2, "기존 listHistory 불변");

    /* 며칠 전 — 0 은 오늘, 날짜가 아니면 null */
    const now = Date.parse("2026-09-28T12:00:00Z");
    assert.equal(store.daysSinceRun("2026-09-28T01:00:00Z", now), 0);
    assert.equal(store.daysSinceRun("2026-09-25T00:00:00Z", now), 3);
    assert.equal(store.daysSinceRun("x", now), null);
  } finally {
    delete g.window;
    delete g.localStorage;
  }
});

/* ── ② 허브 소스 구조 ───────────────────────────────────────────────────────── */
test("[1023] 허브 — 최근 실행 결과 3건은 history-store 를 마운트 뒤 읽고(useEffect) 결과 페이지로 링크, 기록 없으면 카드 없음", () => {
  const recent = code("app/analysis/hub-recent.tsx");
  assert.match(recent, /listRecentHistory\(limit\)/);
  assert.match(recent, /useEffect\(/);
  assert.match(recent, /if \(items\.length === 0\) return null/);
  assert.match(recent, /\?complexId=\$\{encodeURIComponent\(e\.groupKey\)\}/);
  assert.match(recent, /data-tone="plain"/, "흰 카드 안 목록");
  assert.match(recent, /min-h-10/, "행 40px");
  assert.ok(!/text-\[\d+px\]|text-xs|font-extrabold|font-black/.test(recent), "램프 유틸만");
  /* 지역 이름 키(매수 타이밍)는 도구 화면만 — 단지 없는 딥링크를 만들지 않는다 */
  assert.match(recent, /REGION_KEYED = new Set\(\["ai-timing"\]\)/);
  const hero = code("app/analysis/hub-hero.tsx");
  assert.match(hero, /<HubRecentRuns \/>/);
  /* 실행 4칸 "마지막 실행 N일 전" — 고른 단지 id 로 조회, 기록이 있는 칸만 */
  assert.match(hero, /findLastRun\(id, pickedId\)/);
  assert.match(hero, /lastRun\[id\] && \(/);
  assert.match(hero, /마지막 실행 \$\{lastRun\[id\]\}/);
  /* 서버 HTML 은 비움 — 값은 useEffect 안에서만 */
  assert.match(hero, /useEffect\(\(\) => \{\s*if \(!pickedId\)/);
});

test("[1023] 허브 — 시장 카드 티저는 대표 지역 8곳을 서버가 적재(hub-teasers)하고 카드가 고른 단지의 regionId 로 바꾼다(없으면 강남 한 벌)", () => {
  const teasers = code("app/analysis/hub-teasers.ts");
  assert.match(teasers, /export const HUB_TEASER_REGIONS/);
  const list = teasers.slice(teasers.indexOf("HUB_TEASER_REGIONS"), teasers.indexOf("];", teasers.indexOf("HUB_TEASER_REGIONS")));
  assert.equal((list.match(/\{ id: "/g) ?? []).length, 8, "8곳까지");
  assert.match(teasers, /export async function loadHubTeasers\(regionId: string = HUB_REGION_ID\)/);
  assert.match(teasers, /export async function loadHubTeasersByRegion\(\)/);
  /* 적재 함수는 regionId 인자를 받는다(캐시 키에 실린다) — 강남 고정 호출이 남아 있지 않다 */
  assert.match(teasers, /getRegionSnapshot\(regionId\)/);
  assert.match(teasers, /getRegionSeries\(regionId, "sale_index", "monthly", SPARK_POINTS\)/);
  assert.match(teasers, /listRegionTemperatureHistory\(regionId, SPARK_POINTS\)/);
  assert.ok(!teasers.includes("getRegionSnapshot(HUB_REGION_ID)"));
  /* 다른 지역은 온도 행이 없으면 첫 행으로 물러서지 않는다 */
  assert.match(teasers, /regionId === HUB_REGION_ID \? \(tempRes\.value\.rows\[0\] \?\? null\) : null/);

  const swap = code("app/analysis/hub-region-teaser.tsx");
  assert.match(swap, /"use client"/);
  assert.match(swap, /picked\?\.regionId/);
  assert.match(swap, /\(rid && byRegion\[rid\]\) \|\| fallback/);
  const card = code("app/analysis/hub-tool-card.tsx");
  assert.match(card, /teaserByRegion\?: Record<string, HubTeaser> \| null/);
  assert.match(card, /<RegionTeaser slot="spark"/);
  assert.match(card, /<RegionTeaser slot="value"/);
  const page = code("app/analysis/page.tsx");
  assert.match(page, /loadHubTeasersByRegion\(\)/);
  assert.match(page, /teaserByRegion=\{byRegion\}/);
  /* 시장 계열만 — 기록·예시 카드는 그대로 */
  assert.equal((page.match(/teaserByRegion=/g) ?? []).length, 1);
});

test("[1023] 허브 — 계열 머리 \"N종\" 배지는 그 계열 앵커 링크(24px) · 기록 시작 카드는 게스트·로그인 같은 .hub-start · 최근 사용 칩은 권유 꼬리 없음", () => {
  const page = code("app/analysis/page.tsx");
  assert.match(page, /href=\{`#tier-\$\{id\}`\}[\s\S]{0,200}\{count\}종/);
  assert.match(page, /min-h-\[24px\][^"]*tabular-nums/);
  assert.equal((page.match(/hub-start/g) ?? []).length, 2, "게스트 카드 2벌");
  assert.match(code("app/analysis/hub-record-start.tsx"), /card tile hub-start/);
  const css = read("app/globals.css");
  const at = css.lastIndexOf("/* [1023 · AI 분석]");
  assert.ok(at > 0, "CSS 블록");
  assert.ok(at > css.lastIndexOf("/* [1022 · 정렬·글씨·테마]"), "append-only — 1022 블록 뒤");
  assert.match(css.slice(at), /\.hub-start\s*\{\s*min-height:/);
  assert.ok(!/font-size:\s*\d+px/.test(css.slice(at)), "블록 안 임의 px 글자 없음");
  const chips = code("app/analysis/tool-cards-client.tsx");
  assert.ok(!chips.includes("이어가기"), "권유 꼬리 없음");
  assert.match(chips, /최근 사용 · \{last\.title\} ›/);
  /* 예시 계산 고지 한 줄은 배지가 아니라 details 안 첫 줄 */
  const sim = page.slice(page.indexOf('<details className="hub-sim'), page.indexOf("</details>"));
  /* [1028] "실연동 전 도구 · … · 의사결정 근거로 쓰지 않는다" → "예시 수치로 계산 · 실데이터 아님"(내부 말·평어체 걷기) */
  assert.ok(sim.indexOf("</summary>") < sim.indexOf(">예시 수치로 계산</p>"));
  assert.ok(!page.includes("실연동"), "내부 말(실연동)이 화면·설명문에 남았다");
  assert.match(sim, /실제 자료 아님 · \{SIM_TOOLS\.length\}종/);
  assert.ok(!/>\s*실데이터 아님/.test(sim), "배지에 내부 말(실데이터)이 남았다");
});

/* ── ③ 도구 머리 통일 ──────────────────────────────────────────────────────── */
test("[1023] 도구 4종 머리(price·gap·timing·temperature)는 PageHead(t-title) — t-display h1·손 마크업(.pxs-head) 없음, 오른쪽 칩은 actions", () => {
  for (const p of [
    "app/analysis/price/page.tsx",
    "app/analysis/gap/page.tsx",
    "app/analysis/timing/TimingClient.tsx",
    "app/analysis/temperature/TempMapClient.tsx",
  ]) {
    const src = code(p);
    assert.match(src, /components\/PageHead"/, `${p} PageHead import`);
    assert.match(src, /<PageHead\s+icon="[a-z0-9-]+"\s+title=/, `${p} PageHead 사용`);
    assert.ok(!/<h1[^>]*t-display/.test(src), `${p} t-display h1 없음`);
    assert.ok(!src.includes('className="pxs-head"'), `${p} 손 머리 없음`);
    assert.match(src, /actions=\{/, `${p} 오른쪽 칩은 actions 슬롯`);
  }
  /* 머리 오른쪽의 기존 조작은 그대로 */
  assert.match(code("app/analysis/price/page.tsx"), /<RegionSelect regions=\{selectRegions\} current=\{target\.slug\} \/>/);
  assert.match(code("app/analysis/timing/TimingClient.tsx"), /<TimingComplexPicker[\s\S]*<TimingRegionSelect/);
  assert.match(code("app/analysis/temperature/TempMapClient.tsx"), /aria-label="기준 주"/);
  assert.match(code("app/analysis/gap/page.tsx"), /실측 갭 \{measured\}곳/);
  /* 페이지 정책은 그대로 */
  for (const p of ["app/analysis/price/page.tsx", "app/analysis/gap/page.tsx"]) {
    assert.match(read(p), /export const revalidate = 86_400;/);
  }
});

test("[1023] AI 도구 나머지 8종의 단지 고르기 전 머리 — 네이비(hub-hero·한지 글리프 칸·on-dark) 없이 흰 PageHead(premise 한 줄) · 4종 분기·면책·캐시 그대로", () => {
  const page = code("app/analysis/ai/[tool]/page.tsx");
  const hero = page.slice(page.indexOf("{!complexHeader && ("), page.indexOf("<WorkbenchClient"));
  assert.match(hero, /<PageHead/);
  assert.match(hero, /icon=\{WORKBENCH_ICONS\[tid\] \?\? "sparkles"\}/);
  assert.match(hero, /sub=\{persona\.premise\}/);
  assert.ok(!page.includes("hub-hero"), "네이비 면 없음");
  assert.ok(!page.includes("bg-brand-hanji"), "한지 글리프 칸 없음");
  assert.ok(!/text-on-dark/.test(page), "on-dark 글자 없음");
  assert.match(page, /header=\{complexHeader\}/);
  assert.match(page, /data-ai-compliance="notice"/);
  assert.match(page, /투자 권유/);
  assert.match(page, /export const revalidate = 86_400;/);
});

/* ── ④ 부연 라벨·on-dark 토큰·px ───────────────────────────────────────────── */
test("[1023] \"실데이터 기준\" 부연 라벨 4곳 제거 · 노트 AI 결과 판과 AI 코멘트 판은 흰 카드(on-dark·ai-panel 없음) · [region] 임의 px 없음", () => {
  for (const p of [
    "app/analysis/compare/page.tsx",
    /* [1026b] 비교표 · 스냅샷 · 시나리오 세부 카드는 지연 조각 파일로 옮겼다 — 같은 규칙으로 함께 본다 */
    "app/analysis/compare/CompareTable.tsx",
    "app/analysis/compare/RegionMarketSummary.tsx",
    "app/analysis/scenario/ScenarioClient.tsx",
    "app/analysis/scenario/ScenarioDetails.tsx",
    "app/search/ComplexPickerList.tsx",
    "app/analysis/ai-note-analysis.tsx",
  ]) {
    const src = code(p);
    assert.ok(!src.includes("실데이터 기준"), `${p} 부연 라벨 없음`);
    assert.ok(!/on-dark|ai-panel|text-ai-(?:text|muted|accent|success|danger)/.test(src), `${p} on-dark·AI 패널 토큰 없음`);
    assert.ok(!/(?<![\w-])text-\[\d+(?:\.\d+)?px\]/.test(src), `${p} 임의 px 없음`);
  }
  /* 노트 AI 결과 판 — 문구·구조는 그대로(다시 시도 40px · 총평 · 면책) */
  const note = code("app/analysis/ai-note-analysis.tsx");
  /* [1028] 라벨에서 내부 말(LLM)을 걷었다 — AI 모델이 쓴 결과만 "AI", 규칙으로 정리한 결과는 "규칙 정리" */
  assert.match(note, /state\.result\.mode === "llm" \? "AI 정리" : "규칙 정리"/);
  assert.doesNotMatch(note, /LLM/);
  assert.match(note, /min-h-10[^"]*"\s*>\s*다시 시도/);
  assert.match(note, /총평<\/b> · \{state\.result\.verdict\}/);
  assert.match(note, /\{state\.result\.disclaimer\}\./);
  assert.equal((note.match(/btn-primary/g) ?? []).length, 1, "채움 파랑 1개");
  /* 시나리오·비교의 AI 코멘트 판 면책 문구는 그대로 — [1026b] AI 코멘트 판은 세부 지연 조각(ScenarioDetails · RegionMarketSummary)으로 옮겼다 */
  assert.match(code("app/analysis/scenario/ScenarioDetails.tsx"), /본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다\./);
  assert.match(code("app/analysis/compare/RegionMarketSummary.tsx"), /\{state\.disclaimer\}\./);

  const region = code("app/analysis/temperature/[region]/page.tsx");
  assert.ok(!/(?<![\w-])text-\[\d+(?:\.\d+)?px\]/.test(region), "임의 px 17곳 → 램프");
  assert.match(region, /className="t-section text-ink">\s*주별 기록/);
  assert.match(region, /min-w-\[460px\] text-left t-body/);
  assert.match(region, /export const revalidate = 86_400;/);
});

/* ── ⑤ [1028] 문구 정리 — 허브 머리 · 예시 계산 고지 · 계산 요약 · 오류 문구 · 규칙 요약 ─────────────── */
test("[1028] 허브 머리 — 실거래 건수·단지 수를 못 읽으면(null) 그 조각을 통째로 뺀다('실거래 —건' 없음)", () => {
  const hero = code("app/analysis/hub-hero.tsx");
  assert.match(hero, /\{coverage\.txCount !== null && \(\s*<>\s*\{" "\}· 실거래 <b className="t-num text-ink"><Num n=\{coverage\.txCount\} \/><\/b>건\s*<\/>\s*\)\}/);
  assert.match(hero, /\{coverage\.complexCount !== null && \(\s*<>\s*\{" "\}· 단지 <b className="t-num text-ink"><Num n=\{coverage\.complexCount\} \/><\/b>곳\s*<\/>\s*\)\}/);
  /* 도구 수는 늘 있다(코드 상수) */
  assert.match(hero, /\{" "\}· 도구 <b className="t-num text-ink"><CountUp value=\{toolCount\} \/><\/b>개/);
});

test("[1028] 허브 설명문·예시 계산 고지 — 줄표 연결·내부 말(실연동)·평어체 없음", () => {
  const page = code("app/analysis/page.tsx");
  const meta = page.slice(page.indexOf("export const metadata"), page.indexOf('path: "/analysis"'));
  assert.ok(meta.includes("'예시 계산' 표시"), "예시 계산 고지는 설명문에 남는다([1029 · 20] 낱말 꼴)");
  assert.doesNotMatch(meta, /—|실연동/);
  assert.match(page, /<p className="t-sub mt-2 text-text-3">예시 수치로 계산<\/p>/);
  assert.ok(!page.includes("쓰지 않는다"), "평어체 고지가 남았다");
});

test("[1028] 시나리오 계산 요약 — 'AI' 칩 없음 · 이름표는 '계산 요약' · 권유 없이 해요체 · 면책은 그대로", () => {
  const d = code("app/analysis/scenario/ScenarioDetails.tsx");
  assert.doesNotMatch(d, />\s*AI\s*</, "규칙 계산 요약에 AI 칩이 붙어 있다");
  assert.match(d, /t-caption font-bold text-text-3">계산 요약<\/span>/);
  assert.ok(!d.includes("규칙 기반 요약"));
  for (const s of ["재조정하세요", "계산했습니다", "기준입니다", "범위입니다", "커집니다"]) assert.ok(!d.includes(s), s);
  assert.ok(d.includes("으로 계산했어요.") && d.includes("범위예요.") && d.includes("위험 범위예요."));
  assert.match(d, /본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다\./);
  /* 같은 화면의 금리 스트레스 곡선 설명도 해요체 — 계산 요약과 말끝을 섞지 않는다(면책 문장은 예외) */
  const c = code("app/analysis/scenario/ScenarioClient.tsx");
  assert.ok(c.includes("+3.0%p 까지 올라도 소득 대비 40%를 넘지 않아요(현재 조건 기준)."));
  assert.ok(c.includes("를 넘어서면 소득 대비 40%(통상 부담 한계)를 지나가요. 지금은"));
  assert.match(c, /\{calc\.rate\.toFixed\(2\)\}% 예요\./);
  for (const s of ["넘지 않습니다", "지나갑니다", "% 입니다"]) assert.ok(!c.includes(s), s);
});

test("[1028 · 1029·19] 오류 문구 표준 — '○○ 불러오기 실패 · 잠시 후 다시'('없는 것과는 달라요'·'조회가 실패했습니다' 없음)", () => {
  const wb = code("app/analysis/ai/[tool]/WorkbenchClient.tsx");
  assert.match(wb, /<p className="t-body font-bold text-warning">자료 불러오기 실패 · 잠시 후 다시<\/p>/);
  assert.ok(!wb.includes("없는 것과는 달라요"));
  const gap = code("app/analysis/gap/page.tsx");
  assert.match(gap, /title="지역 시세 불러오기 실패"\s+desc="잠시 후 다시 시도해 주세요\."/);
  assert.ok(!gap.includes("조회가 실패했습니다") && !gap.includes("(조회 실패)"));
  assert.ok(gap.includes("월세 환산 수익률·실측 갭 열 불러오기 실패 · 전세가율 열은 그대로 볼 수 있어요."));
});

test("[1028] 후보 지역 규칙 요약(compare-summary) — 숫자와 사실, 해요체 · 권유(협상 여지·추격 매수·좁혀 보세요) 없음", () => {
  const route = code("app/api/ai/compare-summary/route.ts");
  const rule = route.slice(route.indexOf("function ruleComment"), route.indexOf("export async function POST"));
  for (const s of ["협상 여지", "추격 매수", "좁혀 보세요", "큽니다", "작습니다", "고려하세요", "확인해 주세요"]) assert.ok(!rule.includes(s), s);
  assert.ok(rule.includes("% 내렸어요`") && rule.includes("% 올랐어요`"));
  assert.ok(rule.includes("%가 가장 높고 갭 비율이 가장 작아요`"));
  assert.ok(rule.includes('"비교 지역: " +'));
  /* 고르는 규칙은 그대로 — 가장 많이 내린 곳 · 가장 많이 오른 곳 · 전세가율이 가장 높은 곳 */
  assert.ok(rule.includes("(softest.saleChangeMonthly ?? 0) < 0") && rule.includes("hottest !== softest && (hottest.saleChangeMonthly ?? 0) > 0"));
});

test("[1028] 매수 타이밍 머리 한 줄(useCase)은 명사형 사실 — 빈 상태 문장과 같은 말을 되풀이하지 않는다", () => {
  const src = code("lib/ai/tool-identity.ts");
  assert.ok(src.includes('useCase: "가격·거래·입주 물량 신호 3개"'));
  assert.ok(!src.includes("지금 사기 좋은지 신호등 3개로 확인"));
  /* 폰에서 기준 시점 칩과 한 줄에 서야 한다 — 예전 문장(20자)보다 길어지면 칩이 다음 줄로 밀린다 */
  const m = /useCase: "(가격·거래·입주 물량 신호 3개)"/.exec(src);
  assert.ok(m && m[1].length <= 20);
});
