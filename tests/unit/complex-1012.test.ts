/* [1012] D 축(지도·단지·실거래·AI 분석·리포트·요금제·매물) — "AI 가 만든 사이트" 티 걷어내기 회귀 테스트.
 *
 * 고정하는 것 세 가지:
 *  1) 요금제 카드 CTA(lib/subscriptions/plan-cta) — 금지 문구("시작하기"·"무료로 시작") 없이 동사 + 상품명 +
 *     **실제 청구액**. 가격은 billing-periods 단일 출처에서 주입된 값만 쓴다(하드코딩 0).
 *  2) 매물 카드의 시점 라벨(app/listings/price-text listingUpdatedLabel) — 절대 날짜(KST)·끌어올림/등록 구분·
 *     못 읽으면 null.
 *  3) 담당 경로 소스의 형태·문구 규율 — 굵기 800 이상 0 · 임의 반경 0 · 임의 알파 그림자 0 · 금지 문구 0 ·
 *     "부스트"/"가장 인기" 같은 홍보 배지 0 · AI 면책·출처 표기는 그대로(check:ai-compliance 와 같은 마커).
 *
 * 서버 전용 의존(supabase·next)이 붙은 화면 파일은 이 러너에서 불러올 수 없으므로 소스 문자열로 본다
 * (tests/unit/static-pages-1007.test.ts 와 같은 방식).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { planCtaLabel } from "../../lib/subscriptions/plan-cta.ts";
import { planLabel } from "../../lib/subscriptions/labels.ts";
import { monthlyPrice, periodPrice } from "../../lib/subscriptions/billing-periods.ts";
import { listingUpdatedLabel } from "../../app/listings/price-text.ts";
import { buildVerdict } from "../../lib/ai/verdict.ts";
import { diagnosisRadar } from "../../lib/ai/insight-blocks.ts";
import type { LiveToolContext, Footnote } from "../../lib/ai/live-context.ts";
import {
  AXIS_MIN_SCORED,
  EMPTY_TILES_LINE,
  FAILED_TILES_LINE,
  applyAxisRule,
  axisCountLine,
  confirmedAxesLine,
  emptyTilesLine,
  summarizeAxes,
} from "../../app/complex/[id]/axis-summary-rules.ts";
import { evidenceSources } from "../../app/analysis/ai/[tool]/verdict-display.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { TIERS, WORKBENCH_FACTS, workbenchSub } from "../../app/analysis/tool-catalog.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/* ────────────────────────── 1) 요금제 CTA ────────────────────────── */

test("[1012] 요금제 CTA — 유료 카드는 '상품명 결제하기(월 실제 청구액)' · 주입된 가격만 쓴다", () => {
  const pro = { monthly: monthlyPrice("pro"), annualTotal: periodPrice("pro", 12).totalKrw };
  const label = planCtaLabel(planLabel("pro"), "monthly", pro, false);
  assert.equal(label, `플러스 결제하기(월 ${pro.monthly.toLocaleString("ko-KR")}원)`);
  /* 심사 회신 가격(2,900)이 billing-periods 를 거쳐 그대로 찍힌다 — 문구에 숫자를 손으로 적지 않았다는 증거 */
  assert.ok(label.includes("2,900원"));
});

test("[1012] 요금제 CTA — 연간은 오늘 나가는 연 총액을 적는다(월 환산가 아님)", () => {
  const pro = { monthly: monthlyPrice("pro"), annualTotal: periodPrice("pro", 12).totalKrw };
  const label = planCtaLabel(planLabel("pro"), "annual", pro, false);
  assert.equal(label, `플러스 결제하기(연 ${pro.annualTotal.toLocaleString("ko-KR")}원)`);
  assert.ok(label.includes("27,600원"));
  assert.ok(!label.includes("2,300"), "월 환산가(27,600 ÷ 12)를 CTA 에 적지 않는다");
});

test("[1012] 요금제 CTA — 무료 카드는 동사 + 대상('노트 쓰기'), 게스트는 가입 입구임을 말한다", () => {
  assert.equal(planCtaLabel(planLabel("free"), "monthly", null, false), "무료로 노트 쓰기");
  assert.equal(planCtaLabel(planLabel("free"), "monthly", null, true), "가입하고 무료로 노트 쓰기");
});

test("[1012] 요금제 CTA — 금지 문구(시작하기·무료로 시작·지금 바로)가 어떤 조합에서도 나오지 않는다", () => {
  const banned = ["시작하기", "무료로 시작", "지금 바로", "시작하세요", "더 알아보기"];
  const expert = { monthly: monthlyPrice("expert"), annualTotal: periodPrice("expert", 12).totalKrw };
  const combos = [
    planCtaLabel(planLabel("pro"), "monthly", expert, true),
    planCtaLabel(planLabel("expert"), "annual", expert, false),
    planCtaLabel(planLabel("free"), "annual", null, true),
  ];
  for (const c of combos) for (const b of banned) assert.ok(!c.includes(b), `${c} 에 금지 문구 "${b}"`);
});

/* ────────────────────────── 2) 매물 카드 시점 라벨 ────────────────────────── */

test("[1012] 매물 시점 라벨 — 끌어올린 적이 있으면 그 날, 없으면 등록일(KST 절대 날짜)", () => {
  /* 2026-09-25 23:30 UTC = 2026-09-26 08:30 KST — 날짜는 한국 기준으로 읽는다 */
  assert.equal(
    listingUpdatedLabel({ refreshedAt: "2026-09-25T23:30:00Z", createdAt: "2026-09-01T00:00:00Z" }),
    "9.26 끌어올림",
  );
  assert.equal(listingUpdatedLabel({ refreshedAt: null, createdAt: "2026-09-01T03:00:00Z" }), "9.1 등록");
});

test("[1012] 매물 시점 라벨 — 날짜를 못 읽으면 null(지어내지 않는다)", () => {
  assert.equal(listingUpdatedLabel({ refreshedAt: null, createdAt: "언제였더라" }), null);
});

/* ────────────────────────── 3) 담당 경로 소스 규율 ────────────────────────── */

const OWNED_DIRS = [
  "app/map",
  "app/complex",
  "app/tx",
  "app/region",
  "app/analysis",
  "app/reports",
  "app/subscription",
  "app/listings",
  "app/embed",
  "app/glossary",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 주석은 코드가 아니다 — 규칙 기록("… 800 → 700")까지 잡지 않게 지운다 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const ownedFiles = OWNED_DIRS.flatMap((d) => walk(join(ROOT, d))).map((abs) => relative(ROOT, abs).replace(/\\/g, "/"));

test("[1012] 담당 경로 — 굵기 800 이상(font-extrabold·font-black·font-weight:800) 0곳", () => {
  const re = /font-extrabold|font-black|font-\[[89]00\]|font-weight:\s*[89]00/;
  const hits = ownedFiles.filter((f) => re.test(stripComments(read(f))));
  assert.deepEqual(hits, []);
});

test("[1012] 담당 경로 — 임의 반경 0곳 · 임의 알파 그림자(shadow-[0_…rgba]) 0곳 · 큰 그림자(shadow-lg/xl) 0곳", () => {
  const radius = /rounded(?:-[a-z]{1,2})?-\[\d+px\]/;
  /* 임의 알파 그림자 — 지도 위 핀의 drop-shadow(가독 오버레이 성격)는 뺀다 */
  const arbShadow = /(?<!drop-)shadow-\[[^\]]*rgba\(/;
  /* 토큰 `--shadow-lg`(플로팅 허용, 알파 12%)는 큰 그림자가 아니다 — Tailwind 의 shadow-lg/xl 유틸만 잡는다 */
  const bigShadow = /(?<!-)\bshadow-(?:lg|xl|2xl)\b/;
  /* check-ai-look 와 같은 예외: 지도 위 플로팅 패널 · 매물 등록 폼의 하단 고정 저장 바 */
  const bigShadowAllow = (f: string) => f.startsWith("app/map/") || f === "app/listings/new/ListingForm.tsx";
  const hits = ownedFiles.filter((f) => {
    const s = stripComments(read(f));
    return radius.test(s) || arbShadow.test(s) || (!bigShadowAllow(f) && bigShadow.test(s));
  });
  assert.deepEqual(hits, []);
});

test("[1012] 담당 경로 — 금지 문구 0곳(check-ai-look 와 같은 목록)", () => {
  const banned = ["지금 시작", "시작하세요", "시작하기", "무료로 시작", "더 알아보기", "자세히 알아보기", "지금 바로"];
  const hits: string[] = [];
  for (const f of ownedFiles) {
    const s = stripComments(read(f));
    for (const b of banned) if (s.includes(b)) hits.push(`${f}: ${b}`);
  }
  assert.deepEqual(hits, []);
});

test("[1012] 배지는 검증 사실 명사만 — '부스트'·'가장 인기'·'소유확인'(옛 표기) 배지가 화면 문자열에 없다", () => {
  const files = [
    "app/listings/ListingsListClient.tsx",
    "app/listings/[id]/page.tsx",
    "app/map/ListingPreviewPanel.tsx",
    "app/complex/[id]/page.tsx",
    "app/subscription/PlanCards.tsx",
  ];
  for (const f of files) {
    const s = stripComments(read(f));
    assert.ok(!/["'>]부스트["'<]/.test(s), `${f}: "부스트" 배지`);
    assert.ok(!s.includes("가장 인기"), `${f}: "가장 인기" 배지`);
    assert.ok(!/["'>]소유확인["'<]/.test(s), `${f}: 옛 "소유확인" — 기준 사이트 표기 "집주인 확인"`);
  }
  /* 집주인 확인 배지는 세 매물 화면에 남아 있어야 한다(검증 사실) */
  for (const f of ["app/listings/ListingsListClient.tsx", "app/listings/[id]/page.tsx", "app/map/ListingPreviewPanel.tsx"]) {
    assert.ok(read(f).includes("집주인 확인"), `${f}: "집주인 확인" 배지가 사라졌다`);
  }
});

test("[1012] 요금제 카드 — 상품명·CTA 는 단일 출처(planLabel · planCtaLabel)에서만, 하드코딩 가격 0", () => {
  const s = stripComments(read("app/subscription/PlanCards.tsx"));
  assert.ok(s.includes("planCtaLabel("), "planCtaLabel 을 쓰지 않는다");
  assert.ok(s.includes('planLabel("pro")') && s.includes('planLabel("expert")'), "카드 이름이 planLabel 을 거치지 않는다");
  assert.ok(!/2[,_]?900|27[,_]?600|18[,_]?900|181[,_]?200|1[,_]?100/.test(s), "가격 숫자가 카드 파일에 직접 적혀 있다");
});

test("[1012] AI 면책·출처 표기는 그대로(check:ai-compliance 마커)", () => {
  assert.ok(read("app/analysis/ai/[tool]/page.tsx").includes('data-ai-compliance="notice"'));
  assert.ok(read("app/analysis/ai/[tool]/page.tsx").includes("투자 권유"));
  assert.ok(read("app/analysis/ai/[tool]/ResultView.tsx").includes("[AI 서술]"));
  assert.ok(read("app/analysis/ai/[tool]/ResultView.tsx").includes("데이터 출처"));
  assert.ok(read("app/analysis/ai/[tool]/VerdictCard.tsx").includes("공공데이터 자동 계산"));
});

test("[1012] 단지 상세 — AI 예습 브리핑 제목에 반짝이 없음 · 지표 6칸 아래 출처·시점 줄", () => {
  const card = read("app/complex/[id]/AiBriefingCard.tsx");
  const lazy = read("app/complex/[id]/AiBriefingLazy.tsx");
  assert.ok(!card.includes("✨") && !lazy.includes("✨"));
  assert.ok(card.includes(">AI 예습 브리핑<") && lazy.includes(">AI 예습 브리핑<"));
  /* [v4] 지표 6칸은 걷혔다 — 그 출처·시점 줄은 요약 목록 끝 캡션 한 줄("출처 국토교통부 실거래가 · … · 26.08 신고분")이
     맡는다. 캡션의 첫 원천이 국토교통부 실거래가이고 신고 달을 붙이는지를 본다. */
  const page = read("app/complex/[id]/page.tsx");
  assert.ok(page.includes('출처 {shortSources.join(" · ")}'), "요약 목록 끝 출처 캡션이 없다");
  assert.ok(/const shortSources = \[\s*"국토교통부 실거래가",/.test(page), "출처 캡션의 첫 원천이 국토교통부 실거래가가 아니다");
  assert.ok(page.includes("신고분`"), "출처 캡션에 신고 달이 없다");
});

test("[1012] 지도 — 모바일 지도/목록 토글은 이모지 대신 선 아이콘(menu·map) · 패널 머리글 그라데이션 없음", () => {
  const map = stripComments(read("app/map/map-client.tsx"));
  assert.ok(!map.includes("🗺 지도로 보기") && !map.includes("☰ 목록으로 보기"));
  assert.ok(/name=\{mobileView === "map" \? "menu" : "map"\}/.test(map));
  const panel = stripComments(read("app/map/ComplexInfoPanel.tsx"));
  assert.ok(!panel.includes("bg-gradient-to-"), "ComplexInfoPanel 머리글 그라데이션이 남아 있다");
});

/* ────────────────────────── 4) [1012 · R2] 리뷰 2라운드 — analysis A6·B5·C · complex A6·B ────────────────────────── */

const R2_NOW = new Date("2026-09-27T00:00:00Z");

/** 표본 창원 대동 꼴 — 실거래·지역 자료 없음, 기준금리 하나만(5개 항목 중 1개) */
function thinCtx(over: Partial<LiveToolContext> = {}): LiveToolContext {
  return {
    generatedAt: R2_NOW.toISOString(),
    complex: { id: "c-thin", name: "대동아파트", region: "경남 창원시", price: null, recent6: null },
    region: { id: null, name: "경남 창원시", snapshot: null, trend: null, demographics: null },
    rent: null,
    supply: null,
    news: null,
    notes: null,
    macro: { baseRatePct: 2.5, source: "한국은행 ECOS", asOf: "2026-09-10" },
    poi: null,
    ...over,
  } as LiveToolContext;
}

/** 축이 충분한 꼴(가격 흐름·거래 활발·공급 여유·금리 환경 = 4개) */
function fullCtx(): LiveToolContext {
  return thinCtx({
    complex: {
      id: "c-full",
      name: "은마아파트",
      region: "서울 강남구",
      price: { priceKrw: 2_400_000_000, bandLabel: "84㎡", latestYm: "202608", source: "국토교통부 실거래(신고)", asOf: "202608", sample: 12 },
      recent6: { count: 9, fromYm: "202603", toYm: "202608", span: 6 },
    },
    region: {
      id: "seoul-gangnam",
      name: "서울 강남구",
      snapshot: { avgSale: 2_200_000_000, jeonseRatio: 52, saleChangeMonthly: 1.2, tradeCount: 180, period: "202607", source: "한국부동산원", asOf: "202607", sample: 180 },
      trend: null,
      demographics: null,
    } as LiveToolContext["region"],
    supply: { upcomingHouseholds: 1200, upcomingComplexes: 2, items: [], source: "청약홈", asOf: "2026-09-12" } as LiveToolContext["supply"],
  });
}

const THIN_FOOTNOTES: Footnote[] = [{ n: 1, label: "기준금리", source: "한국은행", asOf: "2026-09-10", sample: null, href: null }];

test("[1012 · R2 · complex A6] 5개 항목 중 3개 미만이면 점수를 그리지 않는다 — '자료 부족 — 5개 항목 중 1개만 확인됨' + 확인된 축만", () => {
  const ctx = thinCtx();
  const raw = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: THIN_FOOTNOTES, now: R2_NOW });
  /* lib/ai/verdict.ts 계약(워크벤치)은 항목 1개부터 평균을 낸다 — 허브 요약이 그것을 큰 숫자로 그리던 것이 문제였다 */
  assert.ok(raw.metric, "원본 verdict 는 항목 1개로도 점수를 낸다(워크벤치 계약 그대로)");
  const radar = diagnosisRadar(ctx);
  const axes = summarizeAxes(radar);
  assert.equal(axes.total, 5);
  assert.equal(axes.measured, 1);
  assert.equal(axes.thin, true);
  assert.equal(AXIS_MIN_SCORED, 3);
  const { verdict } = applyAxisRule(raw, radar);
  assert.equal(verdict.metric, null, "점수(대표 수치)가 지워져야 한다");
  assert.equal(verdict.band, "thin");
  assert.equal(verdict.bandLabel, "자료 부족");
  assert.equal(verdict.headline, "자료 부족 — 5개 항목 중 1개만 확인됨");
  assert.ok(!/\d+점/.test(verdict.headline), "결론 문장에 점수가 남아 있다");
  const line = confirmedAxesLine(axes);
  assert.ok(line && line.startsWith("확인된 항목: 금리 환경(기준금리 2.5%)"), line ?? "null");
  /* 원본은 건드리지 않는다 */
  assert.ok(raw.metric);
});

test("[1012 · R2 · complex A6] 축이 3개 이상이면 verdict 그대로(점수 유지) · 확인된 축 줄은 그리지 않는다", () => {
  const ctx = fullCtx();
  const raw = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: THIN_FOOTNOTES, now: R2_NOW });
  const radar = diagnosisRadar(ctx);
  const axes = summarizeAxes(radar);
  assert.ok(axes.measured >= 3, `축 ${axes.measured}개`);
  const { verdict } = applyAxisRule(raw, radar);
  assert.equal(verdict, raw);
  assert.equal(verdict.metric?.label, "투자 점수");
});

test("[1012 · R2 · complex A6] 지표 칸 4개가 전부 '—' 면 격자 대신 한 문장 — 조회 실패는 실패라고 말한다", () => {
  const raw = buildVerdict({ tool: "ai-diagnosis", ctx: thinCtx(), footnotes: THIN_FOOTNOTES, now: R2_NOW });
  assert.equal(raw.tiles?.length, 4);
  assert.ok(raw.tiles?.every((t) => t.value == null), "표본은 칸 4개가 전부 값 없음이어야 한다");
  assert.equal(emptyTilesLine(raw.tiles), EMPTY_TILES_LINE);
  assert.equal(EMPTY_TILES_LINE, "아직 신고된 매매 실거래가 없어요 — 계약 후 30일 안에 신고");
  /* 실거래 조회가 실패한 컨텍스트 — "없어요"라고 하면 거짓이다 */
  const failed = buildVerdict({ tool: "ai-diagnosis", ctx: thinCtx({ unavailable: ["실거래가"] }), footnotes: THIN_FOOTNOTES, now: R2_NOW });
  assert.equal(emptyTilesLine(failed.tiles), FAILED_TILES_LINE);
  /* 값이 하나라도 있으면 격자 그대로(null) */
  const full = buildVerdict({ tool: "ai-diagnosis", ctx: fullCtx(), footnotes: THIN_FOOTNOTES, now: R2_NOW });
  assert.equal(emptyTilesLine(full.tiles), null);
  assert.equal(emptyTilesLine(undefined), null);
});

test("[1012 · R2 · complex A6] 값 있는 칸이 없어도 출처 한 줄은 데이터 출처의 원천으로 채운다(접힘 밖)", () => {
  assert.equal(evidenceSources([{ source: "한국은행" }]), "한국은행");
  assert.equal(evidenceSources([{ source: "국토교통부" }, { source: "한국부동산원" }, { source: "국토교통부" }]), "국토교통부 · 한국부동산원");
  assert.equal(evidenceSources([]), null);
  assert.equal(evidenceSources([{ source: " " }]), null);
  const card = stripComments(read("app/analysis/ai/[tool]/VerdictCard.tsx"));
  assert.ok(card.includes("evidenceSources(verdict.evidence"), "VerdictCard 출처 줄이 evidence 원천으로 떨어지지 않는다");
  assert.ok(card.includes("emptyTilesLine"), "VerdictCard 에 빈 칸 한 줄 자리가 없다");
});

test("[1012 · R2 · complex B → v4] 단지 결과 요약 카드 → 요약 목록의 'AI 종합 진단 ›' 행 하나(점수·결론 없이 확인된 항목 수)", () => {
  /* [v4 · 한 화면 한 가지] 예전 카드("이 단지 결과 요약 — 공공데이터 자동 계산" · VerdictCard · 면책 문단)는 이 화면에서
     걷었다 — 결과·면책은 행이 가는 AI 진단 화면(check:ai-compliance 대상)이 보여 준다. 여기서는 행이 그 화면으로
     가는지, 축 규칙(summarizeAxes)으로 센 "5개 항목 중 N개 확인됨"을 보조 줄로 쓰는지, 옛 링크 문구가 없는지를 잠근다. */
  const code = stripComments(read("app/complex/[id]/ComplexAxisSummary.tsx"));
  assert.ok(code.includes('label="AI 종합 진단"'), "AI 종합 진단 행이 없다");
  assert.ok(code.includes("/analysis/ai/ai-diagnosis?complexId="), "AI 진단 화면으로 가지 않는다");
  assert.ok(code.includes("axisCountLine(summarizeAxes(diagnosisRadar(ctx)))"), "확인된 항목 수를 축 규칙으로 세지 않는다");
  assert.ok(!code.includes("AI 진단으로 ›"), "동사 없는 옛 링크가 남아 있다");
  assert.ok(!code.includes("VerdictCard"), "허브에 판단 카드가 다시 그려진다(v4 — 입구 행 하나)");
  assert.ok(!/\d+점/.test(code), "허브 행에 점수가 있다");
  /* 보조 줄 문구 — 표본 창원 대동(5개 중 1개) */
  assert.equal(axisCountLine(summarizeAxes(diagnosisRadar(thinCtx()))), "5개 항목 중 1개 확인됨");
  /* 페이지는 이 행을 요약 목록 안에서 그린다 */
  assert.ok(stripComments(read("app/complex/[id]/page.tsx")).includes("<ComplexAxisSummary complexId={v.id}"));
});

/* [v4] 히어로 칩 3개(tierNavLabel)와 "단지 1곳 분석 도구 12종" 머리글(tierHeading)은 v4 에서 지웠다(칩 줄 삭제 ·
   섹션 제목 = 명사 + 숫자 "단지 분석 12"). 규칙(소망문·사용법 해설 금지)은 그대로 잠근다. */
test("[1012 · R2 · analysis B5 → v4] 섹션 제목 — 소망문 없음, 명사 + 숫자 · 옛 해설 문구 없음", () => {
  for (const t of Object.values(TIERS)) {
    assert.ok(!/싶어요|궁금해요/.test(t.label), `${t.id}: 소망문 "${t.label}"`);
    assert.ok(!t.label.includes("!"));
  }
  assert.deepEqual(
    Object.values(TIERS).map((t) => t.label),
    ["단지 분석", "지역 시세", "내 임장노트"],
  );
  /* 옛 소망문·사용법 해설이 화면 소스 어디에도 없다 */
  for (const f of ["app/analysis/hub-search.tsx", "app/analysis/page.tsx", "app/analysis/hub-tiers.tsx", "app/analysis/tool-catalog.ts"]) {
    const s = stripComments(read(f));
    for (const bad of ["단지 하나를 깊게 보고 싶어요", "지역·시장 흐름이 궁금해요", "내가 쓴 기록을 정리하고 싶어요", "자동으로 붙습니다", "카드를 누르면 지도가 떠요"]) {
      assert.ok(!s.includes(bad), `${f}: "${bad}"`);
    }
  }
});

/* [v4] 네이비 히어로의 통계 3칸(실거래·단지·도구 수 CountUp)은 지웠다 — 머리는 제목 + 사실 한 줄.
   A6 의 규칙("—" 로 빈 칸을 그리지 않는다)은 사실 한 줄에 그대로: 단지 수가 없으면 숫자 없이 출처만. */
test("[1012 · R2 · analysis A6 → v4] 머리 사실 한 줄 — 값 없으면 숫자 없이 출처, 통계 칸·CountUp 없음", () => {
  const page = stripComments(read("app/analysis/page.tsx"));
  assert.ok(page.includes("coverage.complexCount !== null"), "단지 수가 없을 때도 숫자를 그린다");
  assert.ok(page.includes('"국토교통부 실거래 기준"'), "단지 수가 없을 때 출처 대체 문구가 없다");
  assert.ok(!page.includes('"—"'), "빈 값을 — 로 채운다");
  const search = stripComments(read("app/analysis/hub-search.tsx"));
  assert.ok(!/CountUp|BrandWatermark|grid-cols-3/.test(search), "검색 머리에 통계 칸·워터마크가 남아 있다");
});

/* [v4] 행 보조 줄 = 결과 이름 + 코드에 있는 개수("투자 점수 · 5개 항목"). 12행마다 되풀이하던 커버리지 꼬리
   ("실거래 있는 단지 N곳 · 국토교통부 신고분")는 머리 사실 한 줄로 옮겼다(같은 사실은 한 화면에 한 번). */
test("[1012 · R2 · analysis A6 → v4] 단지 분석 12행 — 보조 줄 숫자는 코드에 있는 개수뿐 · 커버리지는 머리에 한 번", () => {
  for (const id of AI_TOOL_IDS) {
    const f = WORKBENCH_FACTS[id];
    assert.ok(f && f.trim().length >= 4, `${id}: facts 없음`);
    assert.ok(!/[!✨]/.test(f), `${id}: 느낌표/이모지`);
  }
  assert.equal(WORKBENCH_FACTS["ai-diagnosis"], "5개 항목");
  assert.equal(WORKBENCH_FACTS["ai-timing"], "신호 3개");
  assert.equal(workbenchSub("ai-diagnosis"), "투자 점수 · 5개 항목");
  const cards = stripComments(read("app/analysis/workbench-cards.ts"));
  assert.ok(!cards.includes("실거래 있는 단지"), "행마다 커버리지 꼬리가 되돌아왔다");
  const page = stripComments(read("app/analysis/page.tsx"));
  assert.ok(page.includes("실거래 있는 단지 ${coverage.complexCount.toLocaleString(\"ko-KR\")}곳"), "머리 사실 줄에 커버리지가 없다");
  const tiers = stripComments(read("app/analysis/hub-tiers.tsx"));
  assert.ok(tiers.includes("sub={c.sub}"), "행에 결과 한 줄이 없다");
  assert.ok(!tiers.includes("결과:"), "\"결과:\" 줄이 되돌아왔다");
});

test("[1012 · R2 · analysis C → v4] 허브 목록 행은 도구 색을 쓰지 않는다(회색 1종) · 요금제 링크는 파랑(주홍 아님)", () => {
  const tiers = stripComments(read("app/analysis/hub-tiers.tsx"));
  assert.ok(!/tool-rail|tool-scope|tool-soft-bg|tool-ink|style=\{c\.vars\}/.test(tiers), "단지 분석 행에 도구 색이 남아 있다");
  const row = stripComments(read("app/analysis/hub-tool-card.tsx"));
  assert.ok(!/tool-rail|tool-scope|tool-soft-bg|tool-ink|personaVars/.test(row), "지역 시세 행에 도구 색이 남아 있다");
  /* [v4] 한도 줄은 네이비 히어로에서 흰 바탕 맨 끝 캡션으로 내려왔다 — 밝은 면의 링크 파랑(text-primary) */
  const page = stripComments(read("app/analysis/page.tsx"));
  assert.ok(!/text-brand-red[\s\S]{0,80}요금제 보기/.test(page), "요금제 링크가 주홍이다");
  assert.ok(/text-primary[\s\S]{0,40}요금제 보기/.test(page), "요금제 링크가 링크 파랑(text-primary)이 아니다");
});
