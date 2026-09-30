/**
 * [1026 · 지역 시세] 면적대별 실거래가 · 시세·타이밍 · 지역별 시장 온도 · 전세가율·갭 — "1025 표준" 잠금.
 *
 * ① 문장 규칙(lib/market/region-conclusion — 순수): 절차 한 줄 · 결론 한 줄 · 판정 칩 · 근거 · 다음 행동 링크.
 *    숫자는 전 캡처(before1026)에 보이는 실측값 그대로 넣어 본다 — 새 계산이 없으니 들어간 값이 그대로 나와야 한다.
 * ② 소스 구조: 네 화면 모두 StepLine 한 번 · 결론 카드 · 본문 | 레일 340 · 채움 파랑은 region-verdict 한 곳(레일 + 폰 하단 바가
 *    같은 요소) · 이어서 칩의 파란 "노트 쓰기" 없음 · 섹션 점 파랑(.nz-dot-blue) · 갭 폰 카드 목록(20 + 더 보기)/데스크톱 표 ·
 *    온도 Q&A·인용은 폰 <details> · 캐시·쿼리 정책 그대로 · 램프 글자·토큰 색만.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GAP_CARD_PAGE,
  JEONSE_RATIO_CAUTION,
  REGION_ALERT_HREF,
  gapConclusion,
  gapSteps,
  nextCardCount,
  priceConclusion,
  priceSteps,
  regionActionLinks,
  temperatureConclusion,
  temperatureSteps,
  temperatureTone,
  timingConclusion,
  timingSteps,
} from "@/lib/market/region-conclusion";

/* ── ① 문장 규칙 ─────────────────────────────────────────────────────── */

const NAMYANGJU_60_85 = {
  label: "60~85㎡",
  txCount: 3852,
  complexCount: 247,
  medianText: "5.5억",
  minText: "1.2억",
  maxText: "14억",
  perText: "2,402만/평",
  top: 19,
};

test("[1026] 면적대별 — 결론 '남양주시 60~85㎡ 거래 최다 3,852건 · 중앙 5.5억' · 칩 = 지역 분위(보통) · 근거 = 평당·단지·범위 · 절차 현재 = 실거래 범위", () => {
  const c = priceConclusion("남양주시", NAMYANGJU_60_85, true);
  assert.equal(c.title, "남양주시 60~85㎡ 거래 최다 3,852건 · 중앙 5.5억");
  assert.deepEqual(c.chip, { label: "평단가 상위 19%", tone: "neutral" });
  assert.equal(c.sub, "평당 2,402만 · 247개 단지 · 실거래 1.2억~14억");
  /* 다른 칸을 고르면 "거래 최다"가 빠지고 그 칸의 값으로 */
  const other = priceConclusion("남양주시", { ...NAMYANGJU_60_85, label: "85~102㎡", txCount: 253, medianText: "7.3억", top: 31 }, false);
  assert.equal(other.title, "남양주시 85~102㎡ 253건 · 중앙 7.3억");
  /* 분위가 없으면: 거래 최다 칸만 "거래 최다", 아니면 칩 없음(지어내지 않는다) */
  assert.deepEqual(priceConclusion("남양주시", { ...NAMYANGJU_60_85, top: null }, true).chip, { label: "거래 최다", tone: "neutral" });
  assert.equal(priceConclusion("남양주시", { ...NAMYANGJU_60_85, top: null }, false).chip, null);
  assert.equal(priceConclusion("남양주시", { ...NAMYANGJU_60_85, perText: null }, true).sub, "247개 단지 · 실거래 1.2억~14억");

  const plan = priceSteps("남양주시", NAMYANGJU_60_85);
  assert.equal(plan.current, 2);
  assert.deepEqual(
    plan.steps.map((s) => s.label),
    ["지역 · 남양주시", "면적대 · 60~85㎡", "실거래 범위", "다음 행동"],
  );
  assert.equal(plan.steps[2].note, "1.2억~14억");
});

test("[1026] 시세·타이밍 — 결론 '서울 강남구 지수 -0.42% · 온도 37' · 칩 = 온도 문구(톤은 온도 경계) · 근거 = pt·대비·누적·추세 · 보합·빈 값", () => {
  const input = {
    regionLabel: "서울 강남구",
    latestChangePct: -0.42,
    cumulativePct: 5.2,
    weekly: false,
    verdict: "상승 지속",
    latestIndex: 100.1,
    tempScore: 37,
    tempHeadline: "조정 흐름 지속",
  };
  const c = timingConclusion(input)!;
  assert.equal(c.title, "서울 강남구 지수 -0.42% · 온도 37");
  assert.deepEqual(c.chip, { label: "조정 흐름 지속", tone: "neutral" });
  assert.equal(c.sub, "매매가격지수 100.1pt · 지난달 대비 -0.42% · 기간 누적 +5.2% · 추세 상승 지속");
  assert.equal(timingConclusion({ ...input, latestChangePct: 0.02 })!.title, "서울 강남구 지수 보합 · 온도 37", "±0.05% 미만은 보합");
  assert.ok(timingConclusion({ ...input, weekly: true })!.sub!.includes("지난주 대비"));
  /* 온도가 없으면 칩은 지수 판정(보통) · 지수도 온도도 없으면 결론 없음 */
  assert.deepEqual(timingConclusion({ ...input, tempScore: null, tempHeadline: null })!.chip, { label: "상승 지속", tone: "neutral" });
  assert.equal(timingConclusion({ ...input, latestChangePct: null, cumulativePct: null, verdict: null, latestIndex: null, tempScore: null, tempHeadline: null }), null);
  /* 온도 톤 — temperatureHeadline 경계(65 · 35) 그대로 */
  assert.equal(temperatureTone(65), "caution");
  assert.equal(temperatureTone(64), "neutral");
  assert.equal(temperatureTone(35), "neutral");
  assert.equal(temperatureTone(34), "caution");
  assert.equal(temperatureTone(null), "neutral");
  const plan = timingSteps(input, { index: true, volume: true, temp: true });
  assert.deepEqual(plan.steps.map((s) => s.label), ["지역 · 서울 강남구", "신호 · 지수·거래량·온도", "판단", "다음 행동"]);
  assert.equal(plan.current, 2);
  assert.equal(plan.steps[2].note, "조정 흐름 지속");
  assert.equal(timingSteps(input, { index: false, volume: false, temp: false }).steps[1].label, "신호");
});

test("[1026] 시장 온도 — 결론 '이번 주 가장 뜨거운 곳 경기 화성시 병점구 95 · 가장 차가운 곳 경기 과천시 16' · 칩 '평균 53.1' · 시·도를 고르면 이름에서 시·도를 뗀다", () => {
  const base = {
    weekWord: "이번 주",
    sido: null,
    count: 69,
    avg: 53.1,
    hottest: { label: "경기 화성시 병점구", score: 95 },
    coldest: { label: "경기 과천시", score: 16 },
    rising: 0,
    falling: 0,
    compared: 69,
  };
  const c = temperatureConclusion(base)!;
  assert.equal(c.title, "이번 주 가장 뜨거운 곳 경기 화성시 병점구 95 · 가장 차가운 곳 경기 과천시 16");
  assert.deepEqual(c.chip, { label: "평균 53.1", tone: "neutral" });
  assert.equal(c.sub, "69곳 기록 · 직전 주보다 오른 곳 0 · 내린 곳 0");
  const seoul = temperatureConclusion({ ...base, sido: "서울", count: 25, avg: 52.9, hottest: { label: "서울 성동구", score: 70 }, coldest: { label: "서울 강남구", score: 37 } })!;
  assert.equal(seoul.title, "이번 주 서울 가장 뜨거운 곳 성동구 70 · 가장 차가운 곳 강남구 37");
  assert.equal(temperatureConclusion({ ...base, count: 1, coldest: base.hottest })!.title, "이번 주 경기 화성시 병점구 95", "한 곳뿐이면 그 한 곳만");
  assert.equal(temperatureConclusion({ ...base, compared: 0 })!.sub, "69곳 기록", "비교할 직전 주가 없으면 오른·내린 곳을 적지 않는다");
  assert.equal(temperatureConclusion({ ...base, avg: 70.2 })!.chip?.tone, "caution");
  assert.equal(temperatureConclusion({ ...base, hottest: null }), null);
  const nation = temperatureSteps("이번 주", null, 69, 3);
  assert.equal(nation.current, 1);
  assert.deepEqual(nation.steps.map((s) => s.label), ["주 · 이번 주", "시·도", "지역", "다음 행동"]);
  assert.equal(nation.steps[1].note, "3곳 기록");
  const inSido = temperatureSteps("지난주", "서울", 25, 3);
  assert.equal(inSido.current, 2);
  assert.deepEqual(inSido.steps.map((s) => s.label), ["주 · 지난주", "시·도 · 서울", "지역", "다음 행동"]);
  assert.equal(inSido.steps[2].note, "25곳");
});

test("[1026] 전세가율·갭 — 결론 '조건에 맞는 107곳 · 전세가율 중앙 66.2% · 최고 광주 북구 81.4%' · 80% 이상 주의 칩 · 조건이 걸리면 '전체 중앙' · 카드 20장씩", () => {
  const top = { name: "광주 북구", ratio: 81.4, avgSale: 220_000_000, gap: 19_260_000, measured: true };
  const c = gapConclusion({ count: 107, hasCondition: false, median: 66.2, top });
  assert.equal(c.title, "조건에 맞는 107곳 · 전세가율 중앙 66.2% · 최고 광주 북구 81.4%");
  assert.deepEqual(c.chip, { label: "80% 이상 있음", tone: "caution" });
  assert.equal(c.sub, "광주 북구 평균 매매 2.2억 · 갭 1,926만(실측)");
  const seoul = gapConclusion({
    count: 25,
    hasCondition: true,
    median: 66.2,
    top: { name: "노원구", ratio: 62.1, avgSale: undefined, gap: 250_000_000, measured: false },
  });
  assert.equal(seoul.title, "조건에 맞는 25곳 · 전체 중앙 66.2% · 최고 노원구 62.1%", "중앙값은 서버가 낸 전체 값 — 걸러진 곳으로 다시 계산하지 않는다");
  assert.deepEqual(seoul.chip, { label: "모두 80% 미만", tone: "neutral" });
  assert.equal(seoul.sub, "노원구 · 갭 2.5억(추정)");
  const none = gapConclusion({ count: 0, hasCondition: true, median: 66.2, top: null });
  assert.equal(none.title, "조건에 맞는 0곳 · 전체 중앙 66.2%");
  assert.equal(none.chip, null);
  assert.equal(none.sub, null);
  assert.equal(JEONSE_RATIO_CAUTION, 80, "앱의 계약 위험 규칙(80% 이상 주의)과 같은 경계");
  const plan = gapSteps(null, 107);
  assert.equal(plan.current, 1);
  assert.deepEqual(plan.steps.map((s) => s.label), ["조건 · 제한 없음", "결과", "단지", "다음 행동"]);
  assert.equal(plan.steps[1].note, "107곳");
  assert.equal(gapSteps("전세가율 70%+ · 경기", 12).steps[0].label, "조건 · 전세가율 70%+ · 경기");
  assert.equal(GAP_CARD_PAGE, 20);
  assert.equal(nextCardCount(20, 107), 40);
  assert.equal(nextCardCount(100, 107), 107);
  assert.equal(nextCardCount(-5, 107), 20);
});

test("[1026] 다음 행동 — 채움 파랑은 기존 알림함(/notifications) · 링크 3개(지도 · 노트 쓰기 · 결정 카드) · 모르는 지역은 파라미터 없이", () => {
  assert.equal(REGION_ALERT_HREF, "/notifications");
  assert.deepEqual(regionActionLinks("서울 강남구", "서울 강남구"), [
    { href: "/map?region=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC", label: "이 지역 단지 보기" },
    { href: "/notes/new?region=%EC%84%9C%EC%9A%B8%20%EA%B0%95%EB%82%A8%EA%B5%AC", label: "이 지역 노트 쓰기" },
    { href: "/decide", label: "결정 카드" },
  ]);
  assert.deepEqual(
    regionActionLinks(null, "  ").map((l) => l.href),
    ["/map", "/notes/new", "/decide"],
  );
});

/* ── ② 소스 구조 ─────────────────────────────────────────────────────── */

const raw = (p: string) => readFileSync(p, "utf8");
/** 주석은 걷고 본다 — 규칙 기록 문장까지 잡지 않게 */
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SCREENS = {
  price: ["app/analysis/price/page.tsx", "app/analysis/price/BandShelf.tsx", "app/analysis/price/CompareComplexes.tsx", "app/analysis/price/RegionSelect.tsx"],
  timing: ["app/analysis/timing/page.tsx", "app/analysis/timing/TimingClient.tsx"],
  temperature: ["app/analysis/temperature/page.tsx", "app/analysis/temperature/TempMapClient.tsx", "app/analysis/temperature/OpenOnDesktop.tsx"],
  gap: ["app/analysis/gap/page.tsx", "app/analysis/gap/GapScreener.tsx", "app/analysis/gap/RankTable.tsx", "app/analysis/gap/RankCards.tsx"],
} as const;
const VERDICT = "app/analysis/timing/region-verdict.tsx";
const count = (s: string, needle: string) => s.split(needle).length - 1;

test("[1026] 네 화면 — StepLine 한 번 · 결론 카드 · 폰 하단 바 한 번 · 본문 | 레일 340 · 채움 파랑 리터럴 0(region-verdict 한 곳) · 파란 '노트 쓰기' 칩 없음 · 표식", () => {
  for (const [name, files] of Object.entries(SCREENS)) {
    const all = files.map(code).join("\n");
    assert.equal(count(all, "<StepLine"), 1, `${name} 절차 한 줄은 화면당 한 번`);
    assert.equal(count(all, "<VerdictCard"), 1, `${name} 결론 카드 하나`);
    assert.equal(count(all, "<RegionPrimaryBar"), 1, `${name} 폰 하단 바 한 번(레일 복제본 안에 넣지 않는다)`);
    assert.ok(count(all, "<RegionActionCard") >= 1 || all.includes("actionCard"), `${name} 다음 행동 카드`);
    assert.ok(all.includes("lg:grid-cols-[minmax(0,1fr)_340px]"), `${name} 본문 | 레일 340`);
    assert.ok(all.includes("hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start"), `${name} 레일(lg+) sticky`);
    assert.equal(count(all, "btn-primary"), 0, `${name} 채움 파랑 리터럴은 region-verdict 에만`);
    assert.ok(!/note=\{\{/.test(all), `${name} 이어서 칩의 채움 파랑 "노트 쓰기" 없음(다음 행동 카드의 텍스트 링크로)`);
    assert.ok(raw(files[0]).includes("[1026"), `${name} page 표식`);
  }
  for (const p of ["app/analysis/price/BandShelf.tsx", "app/analysis/timing/TimingClient.tsx", "app/analysis/temperature/TempMapClient.tsx", "app/analysis/gap/GapScreener.tsx", VERDICT, "lib/market/region-conclusion.ts", "app/analysis/gap/RankCards.tsx", "app/analysis/temperature/OpenOnDesktop.tsx"]) {
    assert.ok(raw(p).includes("[1026"), `${p} 표식`);
  }
  /* 섹션 점 파랑 하나 — 네 화면 모두 .nz-dot-blue 안 */
  assert.ok(raw("app/analysis/price/page.tsx").includes('className="nz-dot-blue'));
  assert.ok(raw("app/analysis/timing/page.tsx").includes('className="nz-dot-blue"'));
  assert.ok(raw("app/analysis/temperature/page.tsx").includes('className="nz-dot-blue"'));
  assert.ok(raw("app/analysis/gap/page.tsx").includes('className="nz-dot-blue'));
});

test("[1026] region-verdict — 채움 파랑 리터럴 1개(레일 · 폰 바가 같은 요소) · 레일에서만 보이고 폰은 하단 바 · 알림함 경로 · 칩 토큰 3색", () => {
  const v = code(VERDICT);
  assert.equal(count(v, "btn-primary"), 1, "채움 파랑 리터럴 하나");
  assert.ok(v.includes('href="/notifications"'), "기존 알림함 경로(시세·타이밍 '이 지역 알림' 카드와 같다)");
  assert.ok(v.includes("이 지역 알림 받기"));
  assert.ok(v.includes('<div className="hidden lg:block">'), "카드 안 채움 파랑은 lg+ 레일에서만");
  assert.ok(v.includes("<MobilePrimaryBar"), "폰은 공용 하단 바");
  assert.ok(v.includes("bg-success-soft text-success") && v.includes("bg-primary-soft text-primary") && v.includes("bg-warning-soft text-warning"), "판정 칩 토큰");
  assert.ok(v.includes("t-title"), "결론은 t-title");
  assert.ok(!v.includes('"use client"'), "서버·클라이언트 겸용(서버 페이지는 서버 마크업으로)");
  const lib = raw("lib/market/region-conclusion.ts");
  assert.ok(!/server-only|supabase|fetch\(/.test(lib), "순수 — 새 조회 없음");
});

test("[1026] 면적대별 — 결론은 선반이 고른 칸을 따른다 · 숫자 줄은 폰 2칸 · 빈 상태 회색 견본 · 데이터 정책 그대로", () => {
  const shelf = code("app/analysis/price/BandShelf.tsx");
  assert.ok(shelf.includes("priceConclusion(regionName, band, band.slug === busiestSlug)"), "고른 칸(band)으로 결론");
  assert.ok(shelf.includes("priceSteps(regionName, band)"), "고른 칸으로 절차");
  assert.ok(shelf.indexOf("<VerdictCard") < shelf.indexOf('className="pxs-shelf'), "결론 → 선반(대표 그림) 순서");
  assert.ok(shelf.includes("{facts}"));
  const page = code("app/analysis/price/page.tsx");
  assert.ok(page.includes("max-md:hidden") && page.includes("phone: true"), "폰 숫자 칸 줄이기");
  assert.ok(page.includes("border-dashed"), "빈 상태 회색 견본");
  assert.ok(!/text-\[\d+px\]/.test(page), "램프 글자만");
  assert.ok(page.includes("export const revalidate = 86_400;") && page.includes("noIndex: true"), "캐시·색인 정책 그대로");
  assert.ok(page.includes('listBandComplexes(target.name, "area", c.bandSlug, 8)'), "새 조회 없음 — 기존 조회 그대로");
});

test("[1026] 시세·타이밍 — 불러오는 동안 결론 자리만 · 폰은 결론과 겹치는 칸 숨김 · 알림 카드 = 다음 행동(스파크 유지) · 섹션 제목 h2", () => {
  const t = code("app/analysis/timing/TimingClient.tsx");
  assert.ok(t.includes("loading ? <SkBlock h={76} /> : conclusion && <VerdictCard"), "이전 지역 값이 결론에 섞이지 않게");
  assert.ok(t.includes('k.phone ? "min-w-0" : "min-w-0 max-md:hidden"'));
  assert.ok(t.includes("<RegionActionCard") && t.includes("<Spark"), "스파크는 다음 행동 카드 안으로");
  assert.ok(!t.includes("알림 설정"), "흐린 '알림 설정' 버튼은 채움 파랑 '이 지역 알림 받기'로");
  assert.ok(/<h2[^>]*t-section[^>]*>\s*시장 온도/.test(t) && /<h2 className="t-section text-ink">월 거래량<\/h2>/.test(t), "섹션 제목 = h2.t-section(점)");
  assert.ok(t.indexOf("<StepLine") > t.indexOf("<PageHead") && t.indexOf("<StepLine") < t.indexOf("<VerdictCard"), "머리 → 절차 → 결론");
});

test("[1026] 시장 온도 — 결론은 주·시도를 따른다 · 폰은 가장 뜨거운·차가운 칸 숨김 · Q&A·인용은 폰 <details>(데스크톱 펼침) · JSON-LD 그대로", () => {
  const c = code("app/analysis/temperature/TempMapClient.tsx");
  assert.ok(c.includes("temperatureConclusion({") && c.includes("weekWord: chipLabel") && c.includes("sido,"), "주 칩·시도가 결론을 바꾼다");
  assert.equal(count(c, 'className="min-w-0 max-md:hidden"'), 2, "폰에서 숨기는 칸 둘");
  const page = code("app/analysis/temperature/page.tsx");
  const od = page.indexOf("<OpenOnDesktop");
  assert.ok(od > 0 && od < page.indexOf("<CitationBlock") && od < page.indexOf("<QaBlock"), "인용·Q&A 는 접힘 안");
  assert.ok(!page.includes("searchParams"), "서버는 쿼리를 읽지 않는다");
  assert.ok(page.includes("export const revalidate = 86_400"));
  const open = code("app/analysis/temperature/OpenOnDesktop.tsx");
  assert.ok(open.includes("<details") && open.includes('matchMedia("(min-width: 1024px)")'), "첫 HTML 닫힘 · lg+ 에서 연다");
  assert.ok(open.includes("lg:group-open:hidden"), "펼친 데스크톱에서 요약 줄 숨김");
  assert.ok(raw("app/components/QaBlock.tsx").includes("faqJsonLd(items)"), "FAQ JSON-LD 는 QaBlock 그대로(보이는 문답과 같은 배열)");
});

test("[1026] 전세가율·갭 — 폰 카드 목록(20 + 더 보기) · 데스크톱 표 · 조건은 레일(lg) / 결론 아래 접이식(폰) · 서버 정책 그대로", () => {
  const g = code("app/analysis/gap/GapScreener.tsx");
  assert.ok(g.includes('<div className="max-md:hidden">') && g.includes("<RankTable"), "md+ 표");
  assert.ok(g.includes('<div className="md:hidden">') && g.includes("<RankCards rows={filtered.slice(0, shown)}"), "폰 카드 목록");
  assert.ok(g.includes("nextCardCount(shown, filtered.length)") && g.includes("더 보기"), "20장 + 더 보기");
  assert.ok(g.includes("setShown(GAP_CARD_PAGE)"), "조건·정렬이 바뀌면 처음 20장");
  assert.ok(g.indexOf("<VerdictCard") < g.indexOf('aria-controls="gap-panel"'), "폰: 결론 바로 아래 조건(손잡이)");
  assert.ok(g.includes("{panel}\n          {actionCard}") || /<aside[\s\S]*\{panel\}[\s\S]*\{actionCard\}[\s\S]*<\/aside>/.test(g), "레일 = 조건 · 다음 행동");
  assert.ok(g.includes("const matched = useMemo(() => applyFilter(rows, filter)"), "결론의 최고 = 같은 필터의 첫 행(새 계산 없음)");
  assert.ok(g.includes("window.history.replaceState") && !g.includes("router.push"), "조건은 주소에(replaceState)");
  const cards = code("app/analysis/gap/RankCards.tsx");
  assert.ok(cards.includes("/region/${r.regionId}") && cards.includes("effectiveGap(r)") && cards.includes("<Delta"), "카드 = 단지 보기 링크 · 갭(실측 우선) · 지수 변화");
  assert.ok(cards.includes("실측") && cards.includes("추정"), "실측·추정 배지 그대로");
  assert.ok(cards.includes("min-h-10"), "폰 누르는 자리 40px");
  const page = code("app/analysis/gap/page.tsx");
  assert.ok(!/searchParams\s*[:}]|await\s+searchParams/.test(page), "서버는 쿼리를 읽지 않는다");
  assert.ok(page.includes("faqJsonLd(faq)") && page.includes("투자 권유가 아님"), "FAQ · 면책 줄 그대로");
});

test("[1026] 새 파일 — 토큰 색만(hex 없음) · 그라데이션·이모지 없음 · 임의 px 글자 없음 · 굵기 800 없음", () => {
  for (const p of [VERDICT, "app/analysis/gap/RankCards.tsx", "app/analysis/temperature/OpenOnDesktop.tsx", "lib/market/region-conclusion.ts"]) {
    const s = code(p);
    assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(s), `${p} hex 없음`);
    assert.ok(!/gradient/.test(s), `${p} 그라데이션 없음`);
    assert.ok(!/text-\[\d+(?:\.\d+)?px\]/.test(s), `${p} 램프 글자만`);
    assert.ok(!/font-extrabold|font-black|800/.test(s), `${p} 굵기 800 없음`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(s), `${p} 이모지 없음`);
  }
});
