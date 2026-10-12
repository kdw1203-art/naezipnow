/* [1062] 글 많은 화면을 표·요약·낱말·접기로 — 소유자 지시 "표나 그래프, 요약, 키워드 형식으로 심플하고 직관적으로 ·
 * 애플의 디자인 방향성을 참고". 잠그는 사실:
 *  U1 공용 조각 — 접힌 FAQ(native details · 칩 4개까지 · JSON-LD 한 곳) · 사실 표 · 핵심 요약 · 낱말 칩 · 비율 막대.
 *  U2 폰 규칙 — summary 40px 탭 면 · 접었다 편 글은 한 줄 말줄임 예외.
 *  U3 화면 — 어느 화면도 FAQPage 를 두 번 내지 않는다 · 바꾼 화면이 실제로 공용 조각을 쓴다.
 *  U4 사실 보존 — 문장·수치·법정 문구는 지우지 않고 자리만 옮겼다(표본 검사).
 *  U5 디자인 규칙 — 새 조각에 이모지·그라데이션·굵기 800·램프 밖 글자 크기·btn-primary 중복 없음. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");

const COMPACT = [
  "app/components/compact/FaqCompact.tsx",
  "app/components/compact/FactTable.tsx",
  "app/components/compact/KeyPoints.tsx",
  "app/components/compact/KeywordChips.tsx",
  "app/components/compact/MiniBar.tsx",
];

/** 1062 에서 공용 조각으로 바꾼 화면 */
const CONVERTED = [
  "app/subscription/page.tsx",
  "app/about/page.tsx",
  "app/support/faq/page.tsx",
  "app/methodology/page.tsx",
  "app/guides/[slug]/page.tsx",
  "app/guides/contract/page.tsx",
  "app/guides/regulations/page.tsx",
  "app/journey/contract/page.tsx",
  "app/developers/page.tsx",
  "app/data-sources/page.tsx",
  "app/pro/page.tsx",
  "app/town/experts/page.tsx",
  "app/safety/page.tsx",
];

test("U1 공용 조각 — 접힌 FAQ·사실 표·핵심 요약·낱말 칩·비율 막대의 계약", () => {
  const faq = code("app/components/compact/FaqCompact.tsx");
  /* JS 없는 native details(서버 컴포넌트에서 쓰려면 필수) */
  assert.match(faq, /<details className="faq-compact">/);
  assert.doesNotMatch(faq, /"use client"/);
  /* 답은 지우지 않고 접는다 — 칩은 최대 4개만 */
  assert.match(faq, /it\.keys\.slice\(0, 4\)/);
  /* JSON-LD 는 화면에 보이는 배열 그대로, 끄는 길이 있다(한 화면에 FAQPage 는 하나) */
  assert.match(faq, /jsonLd && \(/);
  assert.match(faq, /faqJsonLd\(items\.map\(\(\{ q, a \}\) => \(\{ q, a \}\)\)\)/);
  /* 빈 목록이면 껍데기를 그리지 않는다 */
  assert.match(faq, /if \(items\.length === 0\) return null/);

  const fact = code("app/components/compact/FactTable.tsx");
  assert.match(fact, /<dl /);
  assert.match(fact, /if \(rows\.length === 0\) return null/);

  const key = code("app/components/compact/KeyPoints.tsx");
  assert.match(key, /points\.slice\(0, 4\)/);

  const chips = code("app/components/compact/KeywordChips.tsx");
  assert.match(chips, /items\.filter\(\(s\) => s\.trim\(\)\.length > 0\)/);

  const bar = code("app/components/compact/MiniBar.tsx");
  /* 꾸민 수 금지 — 유한·0 이상만 세고, 라벨과 수를 함께 적는다(막대만 두지 않는다) */
  assert.match(bar, /Number\.isFinite\(r\.value\) && r\.value >= 0/);
  assert.match(bar, /r\.value\.toLocaleString\("ko-KR"\)/);
  assert.match(bar, /aria-hidden="true"/);
  for (const p of COMPACT) assert.doesNotMatch(code(p), /"use client"/, p);
});

test("U2 폰 — summary 는 40px 탭 면, 접었다 편 글은 한 줄 말줄임에서 뺀다", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.faq-compact > summary \{[\s\S]*?min-height: 24px;/);
  assert.match(css, /@media \(max-width: 767px\) \{\s*\.faq-compact > summary \{\s*min-height: 40px;/);
  /* [1012] 한 줄 규칙(li 안 보조 줄)의 예외 — 접힌 FAQ 의 답과 li 안 기준·출처 접기 */
  assert.match(css, /html\[data-mscale\] li \.faq-compact :is\(p, div\):is\(\.t-sub, \.t-caption\)/);
  assert.match(css, /html\[data-mscale\] li \.fineprint-body:is\(\.t-sub, \.t-caption\)/);
});

test("U3 화면 — 공용 조각을 실제로 쓰고, FAQPage 는 화면당 하나", () => {
  for (const p of CONVERTED) {
    const src = code(p);
    /* 가져오는 길은 별칭(@/app/…)도 상대경로(../components/…)도 쓴다 — 조각 이름으로 본다 */
    assert.match(src, /components\/(compact\/[A-Za-z]+|Fineprint)/, `${p} 공용 조각 사용`);
  }
  /* FaqCompact 가 JSON-LD 를 내는 화면은 자기 faqJsonLd 를 또 내지 않는다 */
  for (const p of CONVERTED) {
    const src = code(p);
    const uses = (src.match(/<FaqCompact/g) ?? []).length;
    if (uses === 0) continue;
    const off = (src.match(/jsonLd=\{false\}/g) ?? []).length;
    const ownScript = /jsonLdScript\(\s*faqJsonLd|faqJsonLd\([A-Za-z_]/.test(src);
    if (uses > off) assert.equal(ownScript, false, `${p} FAQPage 중복`);
  }
});

test("U4 사실 보존 — 문장·수치·법정 문구는 자리만 옮긴다", () => {
  const samples: Array<[string, string]> = [
    ["app/subscription/page.tsx", "임장노트 작성·저장, 지도 비교, 실거래 조회는 계속 무료예요."],
    ["app/subscription/page.tsx", "결제 7일 이내 전액 환불"],
    ["app/subscription/page.tsx", "부가세 포함"],
    ["app/about/page.tsx", "신고된 실거래만"],
    ["app/safety/page.tsx", "등기부등본"],
    ["app/data-sources/page.tsx", "국토교통부"],
    ["app/guides/contract/page.tsx", "표제부"],
    ["app/developers/page.tsx", "license"],
    ["app/methodology/page.tsx", "해제"],
  ];
  for (const [p, s] of samples) assert.ok(read(p).includes(s), `${p} 에 "${s}" 가 남아 있어야 한다`);
  /* 결제 고지는 심사 제출 문구 — 요금제 화면에 그대로(ComplianceNotice 호출 유지) */
  assert.match(code("app/subscription/page.tsx"), /<ComplianceNotice variant="payment"/);
});

test("U5 디자인 규칙 — 램프 밖 글자·이모지·그라데이션·굵기 800 없음", () => {
  for (const p of COMPACT) {
    const src = read(p);
    assert.doesNotMatch(src, /text-\[\d+px\]|text-(xs|sm|base|lg|xl)\b/, `${p} 램프 밖 글자 크기`);
    assert.doesNotMatch(src, /gradient|font-extrabold|font-\[8\d\d\]/, `${p} 금지 표현`);
    assert.doesNotMatch(src, /[✀-➿⬀-⯿\uD83C-􏰀-\uDFFF★☆✔]/, `${p} 이모지·기호`);
    assert.ok((src.match(/btn-primary/g) ?? []).length <= 1, `${p} btn-primary 는 파일당 하나`);
  }
});
