import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildComplexCitableSummary,
  freshnessLabelToIsoDate,
  ymParts,
  ymRangeToTemporalCoverage,
  AI_SUMMARY_SELECTOR,
} from "../../lib/seo/citable-summary.ts";
import {
  webPageJsonLd,
  datasetJsonLd,
  dataCatalogJsonLd,
  publisherRef,
  regionEntityId,
  complexEntityId,
  ORGANIZATION_ID,
} from "../../lib/seo/jsonld.ts";
import { buildLlmsFullDoc, type LlmsFullInput } from "../../lib/seo/llms-full.ts";
import { AI_SEARCH_CRAWLERS } from "../../lib/seo/ai-crawlers.ts";
import robots from "../../app/robots.ts";
import { pickUtmParams, withUtm } from "../../lib/analytics/utm.ts";
import { leadConversionLabel, LP_IMJANG_LEAD_SOURCE } from "../../lib/analytics/google-ads.ts";

/* [1006 · E] SEO·AI 가시성 — 인용 요약·JSON-LD 빌더·llms-full·UTM·AI 봇 표의 사실을 잠근다.
   check:jsonld 는 빌드 산출물이 있어야 돌고 동적 라우트(지역·단지 허브)는 그 게이트의 사각지대라,
   여기서 빌더의 모양을 직접 검사한다. */

const ROOT = path.resolve(process.cwd());
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/* ---------- 인용 요약 ---------- */

test("단지 인용 요약 — 값·기준월·출처가 한 문장에, 선택 문장은 재료가 있을 때만", () => {
  const s = buildComplexCitableSummary({
    name: "잠실엘스",
    regionLabel: "서울 송파구",
    emd: "잠실동",
    latestYm: "202608",
    latestAvgManwon: 245_000,
    latestDealCount: 12,
    deals12m: 120,
    households: 5678,
    buildYear: 2008,
  });
  assert.ok(s);
  assert.equal(s.sentences.length, 3);
  assert.match(s.sentences[0], /^서울 송파구 잠실동 잠실엘스의 2026년 8월 아파트 매매 실거래 평균은 24\.5억입니다\(해당 월 신고 12건, 국토교통부/);
  assert.match(s.sentences[1], /최근 12개월.*120건/);
  assert.match(s.sentences[2], /총 5,678세대, 2008년 준공/);
  assert.equal(s.basisMonth, "2026-08");
  assert.match(s.citation, /^내집나우\(naezipnow\.com\) 집계에 따르면, 서울 송파구 잠실동 잠실엘스의 2026년 8월/);
  assert.match(s.citation, /24\.5억이다\(2026년 8월 기준, 국토교통부 실거래 기반\)\.$/);
  assert.equal(s.text, s.sentences.join(" "));
});

test("단지 인용 요약 — 없는 재료는 문장에서 빠지고, 실거래가 없거나 실패면 null", () => {
  const minimal = buildComplexCitableSummary({
    name: "A",
    regionLabel: "서울 강남구",
    latestYm: "202601",
    latestAvgManwon: 98_000,
  });
  assert.ok(minimal);
  assert.equal(minimal.sentences.length, 1);
  assert.doesNotMatch(minimal.sentences[0], /해당 월 신고/);
  assert.match(minimal.sentences[0], /9\.8억입니다\(국토교통부/);
  assert.doesNotMatch(minimal.text, /undefined|null|NaN/);

  assert.equal(buildComplexCitableSummary({ name: "A", regionLabel: "서울", latestYm: "202601", latestAvgManwon: 1, txFailed: true }), null);
  assert.equal(buildComplexCitableSummary({ name: "A", regionLabel: "서울", latestYm: null, latestAvgManwon: 1 }), null);
  assert.equal(buildComplexCitableSummary({ name: "A", regionLabel: "서울", latestYm: "202601", latestAvgManwon: 0 }), null);
  assert.equal(buildComplexCitableSummary({ name: "A", regionLabel: "서울", latestYm: "2026-1", latestAvgManwon: 5 }), null);
});

test("ym 변환 — temporalCoverage·ISO 월, 형식이 아니면 null", () => {
  assert.deepEqual(ymParts("202608"), { label: "2026년 8월", iso: "2026-08" });
  assert.equal(ymParts("202613"), null);
  assert.equal(ymRangeToTemporalCoverage("202509", "202608"), "2025-09/2026-08");
  assert.equal(ymRangeToTemporalCoverage("202509", null), null);
});

test("신선도 캡션 → dateModified — 달력에 있는 날만, 렌더 시각을 만들지 않는다", () => {
  assert.equal(freshnessLabelToIsoDate("2026.09.19"), "2026-09-19");
  assert.equal(freshnessLabelToIsoDate("2026.02.31"), null);
  assert.equal(freshnessLabelToIsoDate("2026-09-19"), null);
  assert.equal(freshnessLabelToIsoDate(null), null);
  assert.equal(freshnessLabelToIsoDate(""), null);
});

/* ---------- JSON-LD 빌더 ---------- */

test("WebPage JSON-LD — speakable 은 실제 셀렉터로만, 비면 넣지 않는다", () => {
  const p = webPageJsonLd({
    path: "/region/gangnam",
    name: "강남구",
    description: "요약",
    dateModified: "2026-09-19",
    speakableSelectors: [AI_SUMMARY_SELECTOR],
    mainEntityId: regionEntityId("gangnam"),
  }) as Record<string, any>;
  assert.equal(p["@type"], "WebPage");
  assert.equal(p["@id"], "https://naezipnow.com/region/gangnam#webpage");
  assert.deepEqual(p.speakable, { "@type": "SpeakableSpecification", cssSelector: ["[data-ai-summary]"] });
  assert.deepEqual(p.mainEntity, { "@id": "https://naezipnow.com/region/gangnam" });
  assert.deepEqual(p.publisher, { "@id": ORGANIZATION_ID });
  assert.equal(p.dateModified, "2026-09-19");
  assert.equal(p.inLanguage, "ko-KR");

  const bare = webPageJsonLd({ path: "/complex/abc", name: "x", speakableSelectors: [], dateModified: null }) as Record<string, any>;
  assert.equal("speakable" in bare, false);
  assert.equal("dateModified" in bare, false);
  assert.equal("mainEntity" in bare, false);
  assert.equal(complexEntityId("a b"), "https://naezipnow.com/complex/a%20b");
  assert.deepEqual(publisherRef(), { "@id": "https://naezipnow.com/#organization" });
});

test("Dataset JSON-LD — 필수 필드·배포 URL·없는 값 생략", () => {
  const d = datasetJsonLd({
    path: "/region/gangnam",
    name: "강남구 월별 거래량",
    description: "설명",
    temporalCoverage: "2025-09/2026-08",
    dateModified: null,
    variableMeasured: ["건수", "평균가"],
    distributionUrl: "https://naezipnow.com/api/public/v1/regions/monthly?region=%EA%B0%95%EB%82%A8%EA%B5%AC",
    spatialCoverage: "서울 강남구",
  }) as Record<string, any>;
  assert.equal(d["@type"], "Dataset");
  assert.equal(d.name, "강남구 월별 거래량");
  assert.equal(d.description, "설명");
  assert.equal(d.isBasedOn, "https://rt.molit.go.kr");
  assert.equal(d.license, "https://naezipnow.com/methodology");
  assert.equal(d.temporalCoverage, "2025-09/2026-08");
  assert.equal("dateModified" in d, false);
  assert.equal(d.distribution[0]["@type"], "DataDownload");
  assert.equal(d.distribution[0].encodingFormat, "application/json");
  assert.deepEqual(d.creator, { "@id": ORGANIZATION_ID });

  const noDist = datasetJsonLd({ path: "/x", name: "n", description: "d" }) as Record<string, any>;
  assert.equal("distribution" in noDist, false);
  assert.equal("temporalCoverage" in noDist, false);
});

test("DataCatalog JSON-LD — 데이터셋이 없으면 만들지 않는다", () => {
  assert.equal(dataCatalogJsonLd({ path: "/developers", name: "n", description: "d", datasets: [] }), null);
  const c = dataCatalogJsonLd({
    path: "/developers",
    name: "공개 집계 API",
    description: "d",
    datasets: [{ path: "/api/public/v1/regions/monthly", name: "지역×월", description: "설명" }],
  }) as Record<string, any>;
  assert.equal(c["@type"], "DataCatalog");
  assert.equal(c.dataset.length, 1);
  assert.equal(c.dataset[0]["@type"], "Dataset");
  assert.equal(c.dataset[0].url, "https://naezipnow.com/api/public/v1/regions/monthly");
});

/* ---------- llms-full ---------- */

function llmsInput(over: Partial<LlmsFullInput> = {}): LlmsFullInput {
  return {
    coverage: { regions: 61, complexes: 26_229 },
    towns: [
      { id: "gangnam", name: "강남구" },
      { id: "haeundae", name: "해운대구", city: "부산" },
    ],
    reportMonths: [
      { ym: "202608", regionCount: 61, txCount: 9_876, updatedAt: "2026-09-19T03:00:00.000Z" },
      { ym: "202607", regionCount: 60, txCount: 8_000, updatedAt: null },
    ],
    glossary: [{ slug: "jeonse-ratio", term: "전세가율", short: "매매가 대비 전세가 비율", category: "거래·시세" }],
    temperatureRegionCount: 50,
    business: { legalName: "우리동네이야기", representative: "대표", registrationNumber: "000-00-00000", supportEmail: "nuguzip@naver.com" },
    ...over,
  };
}

test("llms-full — 숫자는 입력(실데이터)에서만, 못 읽은 숫자는 문장째 생략", () => {
  const full = buildLlmsFullDoc(llmsInput());
  assert.match(full, /지역 랜딩.*: 61개/);
  assert.match(full, /단지 허브.*: 26,229개/);
  assert.match(full, /동네 홈.*: 2개/);
  assert.match(full, /용어사전.*: 1개 용어/);
  assert.match(full, /2026년 8월: 집계 지역 61곳 · 아파트 매매 신고 9,876건 — https:\/\/naezipnow\.com\/reports\/202608 \(집계 갱신 2026-09-19\)/);
  assert.match(full, /인용 예\(최신 달 실제 값\): "내집나우\(naezipnow\.com\) 집계에 따르면, 2026년 8월 집계 지역 61곳의 아파트 매매 실거래 신고는 9,876건이다/);
  assert.match(full, /- 부산: 해운대구\(https:\/\/naezipnow\.com\/region\/haeundae\)/);
  assert.match(full, /- 전세가율 — 매매가 대비 전세가 비율 \(https:\/\/naezipnow\.com\/glossary\/jeonse-ratio\)/);
  /* 옛 정적 파일의 손으로 적은 예시 숫자가 다시 들어오면 안 된다 */
  assert.doesNotMatch(full, /12,345/);
  assert.doesNotMatch(full, /undefined|null|NaN/);

  const partial = buildLlmsFullDoc(llmsInput({ coverage: { regions: null, complexes: null }, reportMonths: null }));
  assert.doesNotMatch(partial, /지역 랜딩\(\/region/);
  assert.doesNotMatch(partial, /단지 허브\(\/complex\/\{id\}, 실거래 1건 이상\):/);
  assert.match(partial, /월 목록을 읽지 못했습니다/);
  assert.doesNotMatch(partial, /인용 예\(최신 달 실제 값\)/);

  const empty = buildLlmsFullDoc(llmsInput({ reportMonths: [] }));
  assert.match(empty, /아직 집계가 존재하는 달이 없습니다/);
});

test("llms-full — 정적 public 파일은 지웠고 라우트만 남는다(shadowing 방지)", () => {
  assert.throws(() => read("public/llms-full.txt"));
  assert.match(read("app/llms-full.txt/route.ts"), /buildLlmsFullDoc/);
  assert.match(read("app/llms.txt/route.ts"), /llms-full\.txt/);
});

/* ---------- AI 크롤러 robots ---------- */

test("robots — AI 검색·사용자 대리 봇 그룹이 같은 규칙으로 열려 있고, 학습 전용 봇은 열지 않는다", () => {
  const r = robots();
  const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
  const byUa = new Map(rules.map((x) => [String(x.userAgent), x]));
  for (const ua of ["ChatGPT-User", "Claude-SearchBot", "Claude-User", "Perplexity-User", "Amazonbot", "OAI-SearchBot", "PerplexityBot"]) {
    const rule = byUa.get(ua);
    assert.ok(rule, `${ua} 그룹 없음`);
    assert.deepEqual(rule.allow, ["/", "/api/og/"]);
    assert.ok(Array.isArray(rule.disallow) && rule.disallow.includes("/my") && rule.disallow.includes("/admin"));
  }
  assert.equal(byUa.get("meta-externalagent")?.disallow, "/");
  assert.equal(byUa.has("Applebot-Extended"), false);
  assert.equal(new Set(AI_SEARCH_CRAWLERS).size, AI_SEARCH_CRAWLERS.length);
});

test("robots — AI 봇 이름은 next.config.ts htmlLimitedBots(head 메타 보장)에도 전부 있다", () => {
  const cfg = read("next.config.ts");
  const m = /const HTML_LIMITED_BOTS =\s*\/(.+)\/i;/.exec(cfg);
  assert.ok(m, "HTML_LIMITED_BOTS 정규식을 찾지 못함");
  const re = new RegExp(m[1], "i");
  for (const ua of AI_SEARCH_CRAWLERS) {
    assert.ok(re.test(ua), `${ua} 가 htmlLimitedBots 에 없음`);
  }
});

/* ---------- UTM 보존·리드 전환 ---------- */

test("UTM — utm_* 만 옮기고, 목적지 값이 우선하며, 해시는 유지한다", () => {
  assert.deepEqual(pickUtmParams("?utm_source=google&utm_medium=cpc&gclid=abc&callbackUrl=/x"), [
    ["utm_source", "google"],
    ["utm_medium", "cpc"],
  ]);
  assert.deepEqual(pickUtmParams(""), []);
  assert.deepEqual(pickUtmParams(null), []);
  assert.deepEqual(pickUtmParams(`?utm_term=${"a".repeat(121)}`), []);
  assert.equal(withUtm("/notes/new", "?utm_source=google&utm_campaign=imjang-2026w38"), "/notes/new?utm_source=google&utm_campaign=imjang-2026w38");
  assert.equal(withUtm("/notes/new", "?x=1"), "/notes/new");
  assert.equal(withUtm("/notes/new?utm_source=kept#top", "?utm_source=google&utm_medium=cpc"), "/notes/new?utm_source=kept&utm_medium=cpc#top");
});

test("리드 전환 라벨 — env 없으면 null(무동작), 있으면 그 값", () => {
  const prev = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
  delete process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
  assert.equal(leadConversionLabel(), null);
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL = " abc/XYZ ";
  assert.equal(leadConversionLabel(), "abc/XYZ");
  if (prev === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;
  else process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL = prev;
  assert.equal(LP_IMJANG_LEAD_SOURCE, "lp_imjang");
});

/* ---------- 광고 랜딩·허브 배선 (소스 검사) ---------- */

test("광고 랜딩 /lp/imjang — noindex · 단일 CTA(/notes/new) · generate_lead · 지어낸 후기 없음", () => {
  const page = read("app/lp/imjang/page.tsx");
  const cta = read("app/lp/imjang/LpCta.tsx");
  assert.match(page, /robots: \{ index: false/);
  assert.match(page, /loadCoverage/);
  /* 주석("지어낸 후기 금지")은 빼고 화면 문구만 본다 */
  const visible = page.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(visible, /후기|리뷰|만족도|명이 선택/);
  assert.match(cta, /const TARGET = "\/notes\/new"/);
  assert.match(cta, /"generate_lead"/);
  assert.match(cta, /withUtm\(TARGET, window\.location\.search\)/);
  /* CTA 라벨은 상수 한 곳에서만 정의되고, 버튼은 그 상수만 쓴다(같은 행동 하나) */
  assert.match(page, /const CTA_LABEL = "임장노트 무료로 시작"/);
  assert.ok((page.match(/<LpCta label=\{CTA_LABEL\}/g) ?? []).length >= 1);
  assert.doesNotMatch(page, /<LpCta label="/);
});

test("지역·단지 허브 — data-ai-summary 블록과 WebPage(speakable) JSON-LD 가 같이 있다", () => {
  const region = read("app/region/[id]/page.tsx");
  const complex = read("app/complex/[id]/page.tsx");
  for (const src of [region, complex]) {
    assert.match(src, /data-ai-summary=""/);
    assert.match(src, /webPageJsonLd\(/);
    assert.match(src, /freshnessLabelToIsoDate\(/);
  }
  assert.match(region, /datasetJsonLd\(/);
  assert.match(complex, /buildComplexCitableSummary\(/);
  /* 단지 허브의 요약은 실거래 조회 실패면 만들지 않는다 */
  assert.match(complex, /txFailed: v\.loadFailures\.includes\("실거래"\)/);
});
