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
import {AXIS_MIN_SCORED, EMPTY_TILES_LINE, FAILED_TILES_LINE, applyAxisRule, confirmedAxesLine, emptyTilesLine, summarizeAxes} from "../../app/complex/[id]/axis-summary-rules.ts";
import { evidenceSources } from "../../app/analysis/ai/[tool]/verdict-display.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";

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
    /* [1014] 임의 알파 그림자는 뺐다 — 개편(v4) 전 리퀴드 유리 표면(지도 칩·요금제 카드)이 돌아왔다 */
    void arbShadow;
    return radius.test(s) || (!bigShadowAllow(f) && bigShadow.test(s));
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

test("[1012] AI 면책·출처 표기는 그대로(check:ai-compliance 마커)", () => {
  assert.ok(read("app/analysis/ai/[tool]/page.tsx").includes('data-ai-compliance="notice"'));
  assert.ok(read("app/analysis/ai/[tool]/page.tsx").includes("투자 권유"));
  assert.ok(read("app/analysis/ai/[tool]/ResultView.tsx").includes("[AI 서술]"));
  assert.ok(read("app/analysis/ai/[tool]/ResultView.tsx").includes("데이터 출처"));
  assert.ok(read("app/analysis/ai/[tool]/VerdictCard.tsx").includes("공공데이터 자동 계산"));
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

test("[1012 · R2 · complex A6] 5개 항목 중 3개 미만이면 점수를 그리지 않는다 — '자료 부족 · 5개 항목 중 1개만 확인됨' + 확인된 축만", () => {
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
  assert.equal(verdict.headline, "자료 부족 · 5개 항목 중 1개만 확인됨");
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
  assert.equal(EMPTY_TILES_LINE, "신고된 매매 실거래 없음 · 신고 기한은 계약 후 30일");
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

