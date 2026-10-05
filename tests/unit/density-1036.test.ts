/* [1036 · 밀도] 설명 줄 접기(Fineprint) 규칙 — 소유자 지시 "글씨가 너무 많고 복잡해 보인다"(10-05) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("[1036] Fineprint — native details · 라벨 기본 '기준 · 출처' · CSS 폰 40px 탭 면", () => {
  const src = read("app/components/Fineprint.tsx");
  assert.match(src, /<details className=\{`fineprint/);
  assert.match(src, /label = "기준 · 출처"/);
  assert.doesNotMatch(src, /"use client"/);
  const css = read("app/globals.css");
  assert.match(css, /\.fineprint > summary \{/);
  assert.match(css, /@media \(max-width: 767px\) \{\s*\.fineprint > summary \{\s*min-height: 40px;/);
});

test("[1036] 단지 허브 — 요약은 첫 문장만 본문, 나머지는 접힘(글은 DOM 에 그대로 · speakable 유지)", () => {
  const page = read("app/complex/[id]/page.tsx");
  assert.match(page, /data-ai-summary=""/);
  assert.match(page, /\{citable\.sentences\[0\]\}/);
  assert.match(page, /<Fineprint className="mt-1" label="기준 · 출처">/);
  assert.match(page, /국토교통부 실거래 단순 평균 · 매물 호가 아님/);
  /* 머리글 부제는 주소 하나 — 지번·K-apt 코드는 데이터 출처 접힘으로 */
  assert.match(page, /const headSub = \[v\.spec\.roadAddress\?\.trim\(\) \|\| v\.spec\.address\?\.trim\(\) \|\| null\]/);
  assert.match(page, /jibunExtra/);
});

test("[1036] 허브 카드들 — 범례·표 기준·면적대 기준·계산식·관리비 내역은 Fineprint · 폰 최근 실거래 6줄", () => {
  assert.match(read("app/complex/[id]/TxTrendSection.tsx"), /<Fineprint label="범례 · 기준">/);
  assert.match(read("app/complex/[id]/TxTrendSection.tsx"), /신고 집계 중 · 계약 후 30일 내 신고/);
  assert.match(read("app/complex/[id]/RecentDealsTable.tsx"), /<Fineprint>국토교통부 실거래가 · 신고가 = 타입별 기간 내 최고가/);
  assert.match(read("app/complex/[id]/RecentDealsTable.tsx"), /i >= 6 \? " max-md:hidden" : ""/);
  assert.match(read("app/complex/[id]/ComplexAreaBands.tsx"), /<Fineprint className="mt-1 px-1">/);
  assert.match(read("app/complex/[id]/JeonseGapCards.tsx"), /<Fineprint label="계산">/);
  assert.match(read("app/complex/[id]/MgmtFeeCard.tsx"), /<Fineprint className="mt-1.5" label="내역 · 출처">/);
  assert.match(read("app/complex/[id]/hub-client.tsx"), /aiBody\.indexOf\("\. "\)/);
});

test("[1036] 결과 요약 — VerdictCard fold(출처 줄 + 근거 + 반례 → 접힘 하나) · 허브만 켠다 · 면책·자동 계산 표기 유지", () => {
  const card = read("app/analysis/ai/[tool]/VerdictCard.tsx");
  assert.match(card, /fold\?: boolean/);
  assert.match(card, /\{fold && !compact && \(\s*<Fineprint label="출처 · 기준">/);
  assert.match(card, /공공데이터 자동 계산/);
  assert.match(read("app/complex/[id]/ComplexAxisSummary.tsx"), /\n\s*fold\n/);
  assert.match(read("app/complex/[id]/ComplexAxisSummary.tsx"), /참고용 요약 · 투자 권유 아님/);
  /* AI 도구 화면(ResultView)의 VerdictCard 는 fold 를 켜지 않는다 — 근거·반례가 펼쳐진 채 남는다 */
  assert.doesNotMatch(read("app/analysis/ai/[tool]/ResultView.tsx"), /<VerdictCard[^>]*\sfold[\s>]/s);
});

test("[1036] 홈·분석·푸터 — 범례는 섹션 아래 한 번 · 브리핑 기준은 ⓘ · 한도 캡션·푸터 설명 문단은 접힘 · 면책은 그대로", () => {
  const home = read("app/page.tsx");
  assert.match(home, /<Fineprint label="기준 · 출처">\s*선 = 최근 주간 매매가격지수/);
  assert.match(home, /<Explain title=\{HOME_AI_BRIEFING_LABEL\} body=\{briefing\.basis\} size=\{12\} \/>/);
  assert.match(home, /<Fineprint label="표시 기준">\{LAB_NOTES_CAPTION\}<\/Fineprint>/);
  assert.doesNotMatch(read("app/components/home/RegionPulseCards.tsx"), /주 시세 지수`/);
  assert.match(read("app/analysis/hub-hero.tsx"), /<Fineprint className="px-1" label="단지 분석 한도">/);
  const footer = read("app/components/Footer.tsx");
  assert.match(footer, /<Fineprint className="pe-\[68px\] md:pe-0" label="출처 · 운영 주체">/);
  assert.match(footer, /\{NO_PROFIT_GUARANTEE_TEXT\}/);
  assert.match(read("app/components/AIPanel.tsx"), /본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다/);
});
