/* [1074] 전 페이지 검토(1073 의 §4 계획) 두 번째 묶음 — 페이지별 세부: 단지 비교 · 실거래 구간 · 단지 목록 + 전 페이지 측정에서 나온
 * 손가락 표적·칸 넘침·읽는 폭(docs/design-review-1073.md · release-1074.md).
 *  P1 단지 비교 — 폰에서 지역 칩 63개가 첫 화면을 덮었다 → 폰은 한 줄 가로 밀기 · 지역 화면 링크 40px.
 *  P2 실거래 구간 — 단지 이름 밑줄 파란 글자 40줄 · 폰 세로 16px → 밑줄은 손을 올렸을 때 · 폰 40px. 지역 칸은 이름 한 줄.
 *  P3 단지 목록 — 구 칩 폰 31 → 40px · 화살표 "→" 를 사이트 꼴 "›" 로.
 *  P4 24px 미만 표적(전 페이지 폰 실측 81곳) — 단독 글자 링크는 tap-line · 접기 단추 40px · 체크박스 20px · 오프라인 홈 40px.
 *  P5 칸 넘침 — 두 자리 순위(10~)가 15px 칸 밖으로(토론 47줄 · 임장 가이드) → 고정 폭.
 *  P6 읽는 폭 — 지역 요약 문단 89자/줄 → 72ch. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("P1 단지 비교 — 폰 한 줄 가로 밀기 · PC 줄바꿈 · 지역 화면 링크 40px", () => {
  const s = read("app/complex/compare/page.tsx");
  assert.match(s, /aria-label="지역 바로가기"\s*className="scroll-x-hidden-bar flex gap-1\.5 max-md:-mx-3\.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-3\.5 md:flex-wrap"/);
  assert.match(s, /className="chip shrink-0 whitespace-nowrap bg-surface px-3 py-1\.5 t-sub font-bold text-text-2 no-underline shadow-sm"/);
  assert.match(s, /className="mt-1 inline-flex min-h-\[40px\] items-center t-sub font-bold text-primary md:min-h-6"/);
  /* 63개 링크는 그대로 HTML 에(검색 색인) — groups.map 두 번(칩 · 접힘) */
  assert.equal((s.match(/groups\.map\(/g) ?? []).length, 2);
});

test("P2 실거래 구간 — 이름 밑줄 없음(손 올리면) · 폰 40px · 지역 칸 이름 한 줄", () => {
  const band = read("app/tx/[region]/[kind]/[band]/page.tsx");
  assert.match(band, /<td className="py-0\.5 md:py-2\.5">\s*<Link\s+href=\{complexHrefFromNames\(region\.name, c\.name\)\}\s+className="inline-flex min-h-\[40px\] items-center font-bold text-primary no-underline hover:underline md:min-h-0"/);
  assert.doesNotMatch(band, /className="font-bold text-primary underline"/);
  const region = read("app/tx/[region]/page.tsx");
  assert.match(region, /className="inline-flex min-h-\[40px\] items-center font-bold text-primary no-underline hover:underline md:min-h-6"/);
  const idx = read("app/tx/page.tsx");
  assert.match(idx, /flex min-w-0 items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-0\.5/);
});

test("P3 단지 목록 — 구 칩 폰 40px · 사이트 꼴 화살표", () => {
  const s = read("app/complex/browse/page.tsx");
  assert.match(s, /inline-flex min-h-\[40px\] items-center rounded-full px-3 py-1\.5 t-sub font-bold transition md:min-h-0/);
  assert.match(s, /지역별 면적대·가격대 실거래 보기 ›/);
  assert.doesNotMatch(s, /실거래 보기 →/);
});

test("P4 24px 미만 표적 — 단독 링크 tap-line · 단추 40px · 체크박스 20px", () => {
  assert.match(read("app/messages/page.tsx"), /className="tap-line text-xs font-semibold text-primary no-underline"/);
  const lib = read("app/town/library/page.tsx");
  assert.equal((lib.match(/className="tap-line (ml-auto )?t-sub font-bold text-primary no-underline"/g) ?? []).length, 6);
  assert.doesNotMatch(lib, /className="(ml-auto )?t-sub font-bold text-primary no-underline"/);
  assert.match(read("app/town/experts/join/page.tsx"), /className="tap-line mt-3 inline-block t-caption font-bold text-primary/);
  assert.match(read("app/notes/templates/TemplateBrowser.tsx"), /className="flex min-h-\[40px\] items-center justify-between text-left"/);
  assert.match(read("app/town/experts/apply/ApplyForm.tsx"), /className="mt-0\.5 h-\[20px\] w-\[20px\] shrink-0 accent-primary"/);
  assert.match(read("app/offline/page.tsx"), /\.nz-off-home\{display:inline-flex;align-items:center;min-height:40px;/);
  assert.match(read("app/imjang/[slug]/page.tsx"), /className="tap-line min-w-0 flex-1 truncate t-body font-bold text-ink no-underline hover:text-primary"/);
  assert.match(read("app/digest/(index)/page.tsx"), /className="tap-line group press block no-underline"/);
  assert.match(read("app/notes/market/page.tsx"), /<Link href="\/notes" className="tap-line no-underline hover:underline">/);
});

test("P5 두 자리 순위 칸 — 고정 폭", () => {
  assert.match(read("app/components/talk/TalkPanel.tsx"), /className="w-\[22px\] shrink-0 text-center t-sub font-bold tabular-nums text-text-3">\{rank \?\? "·"\}/);
  assert.match(read("app/imjang/[slug]/page.tsx"), /className="t-num w-\[24px\] shrink-0 text-center t-body font-bold text-primary"/);
});

test("P6 읽는 폭 — 지역 요약 문단", () => {
  assert.match(read("app/region/[id]/page.tsx"), /<p className="max-w-\[72ch\] t-sub text-text-2">\{lead\}<\/p>/);
});
