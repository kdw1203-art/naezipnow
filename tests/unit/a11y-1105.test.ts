/* [1105 · 접근성] 남은 세 가지 — 소스(.tsx · css)를 글로 읽어 고정한다(tsx 는 import 못 한다).
 *  1) /complex/compare 허브 — <summary> 안 <h2>(대화형 요소 안 제목) → summary 는 글(span · 같은 모양) · 제목은 summary 밖(sr-only h2) · details 이름 = 그 제목.
 *  2) 가로 밀기 줄(HScroll · .scroll-x-hidden-bar · 비교 허브 지역 칩) — 바깥 포커스 링 위 · 아래가 overflow 에 잘렸다(실측 4px) → 안쪽 링(-2px).
 *  3) /complex/compare/[slug] 폰 표 — 1102 의 항목 줄(th scope=colgroup)은 아래 값 전부의 열 머리로 읽히고 값 줄엔 행 머리가 없었다 →
 *     항목 줄은 aria-hidden 글 · 행 머리 th 는 폰에도 남기고(sr-only · 폭 0) 값 칸 headers 가 열 머리 · 행 머리를 가리킨다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("1) 비교 허브 — summary 안에 제목 없음 · 같은 모양의 span · 제목은 summary 밖 · details 이름", () => {
  const page = strip(read("app/complex/compare/page.tsx"));
  const summaries = page.match(/<summary[\s\S]*?<\/summary>/g) ?? [];
  assert.ok(summaries.length >= 1);
  for (const s of summaries) assert.doesNotMatch(s, /<h[1-6][\s>]/, "summary 안 제목");
  /* 예전 h2 와 같은 클래스 + 폰 배율 한 줄 규칙(globals html[data-mscale] :is(h2,h3,h4))을 같은 값으로 */
  assert.match(page, /<summary className="flex min-h-10 cursor-pointer list-none items-baseline justify-between gap-3 t-section text-ink \[&::-webkit-details-marker\]:hidden">\s*<span className="t-section text-ink \[html\[data-mscale\]_&\]:truncate">\{group\.label\}<\/span>/);
  assert.match(read("app/globals.css"), /html\[data-mscale\] :is\(h2, h3, h4\),[\s\S]{0,120}white-space: nowrap;\s*overflow: hidden;\s*text-overflow: ellipsis;/);
  /* 제목 — details 바로 앞 · 화면 낭독기 전용 · 지역마다 하나(제목 이동 유지) · details 이름 */
  assert.match(page, /<Fragment key=\{group\.regionId\}>\s*<h2 id=\{`region-h-\$\{group\.regionId\}`\} className="sr-only">\{group\.label\}<\/h2>\s*<details\s+id=\{`region-\$\{group\.regionId\}`\}\s+open=\{gi === 0\}\s+aria-labelledby=\{`region-h-\$\{group\.regionId\}`\}/);
  assert.doesNotMatch(page, /<details\s+key=/, "key 는 Fragment 로");
  assert.match(page, /import \{ cache, Fragment \} from "react";/);
});

test("2) 가로 밀기 줄 — 칩 · 틀 자신의 포커스 링을 안쪽으로(-2px) · 포커스 아닐 때 규칙 없음 · 토큰 규칙", () => {
  const hs = strip(read("app/components/HScroll.tsx"));
  assert.match(hs, /<div\s+ref=\{ref\}\s+data-hscroll=""\s+className=\{`overflow-x-auto /);
  const cmp = strip(read("app/complex/compare/page.tsx"));
  /* [1119] /complex/compare 칩 줄 → "지역 고르기" 접힘(가로 밀기 틀 없음) */
  assert.match(cmp, /<nav aria-label="지역 바로가기" className="card absolute left-0 z-20/);
  /* 칩 줄 셋이 실제로 그 틀 안에 있다 — /calculator(HScroll) · /complex/browse(.scroll-x-hidden-bar) · /complex/compare(data-hscroll) */
  assert.match(read("app/calculator/CalculatorNav.tsx"), /<HScroll hint=\{null\} className="mb-4">/);
  /* [1115] /complex/browse 칩 줄은 "구 바꾸기" 접힘으로 바뀌어 가로 밀기 줄이 없다 */
  assert.doesNotMatch(read("app/complex/browse/page.tsx"), /className="scroll-x-hidden-bar rise-in-1 /);
  const css = read("app/globals.css");
  /* [1124] 뒤에 덧붙은 절(좌우 광고 띠)은 이 절의 검사 밖 */
  const end1124 = css.indexOf("[1124] 좌우 광고 띠");
  const tail = css.slice(css.indexOf("[1105 · 접근성]"), end1124 > 0 ? css.lastIndexOf("/*", end1124) : undefined);
  assert.ok(css.indexOf("[1105 · 접근성]") > css.indexOf("[1104 · 속도] 위 리퀴드 판"), "파일 끝에 덧붙임");
  assert.match(
    tail,
    /:is\(\[data-hscroll\], \.scroll-x-hidden-bar\) :is\(a, button, summary, input, select, textarea, \[tabindex\]\):focus-visible,\s*\[data-hscroll\]:focus-visible \{\s*outline-offset: -2px;\s*\}/,
  );
  /* 특이성 (0,3,0) — .tile:focus-visible(0,2,0) · .tool-scope :is(a, …):focus-visible(0,2,1) 보다 높아 오프셋만 바꾼다(색 · 두께는 각 규칙 그대로) */
  assert.doesNotMatch(tail, /outline:\s|outline-color|outline-width/);
  /* 포커스 상태 밖 규칙 없음(그림 변화 없음) · 새 hex · 번짐 · 800 · 글자 크기 없음 */
  assert.equal((tail.match(/\{/g) ?? []).length, 1);
  assert.doesNotMatch(tail, /#[0-9a-fA-F]{3,8}\b|gradient|font-weight:\s*8|font-size:/);
});

test("3) 비교 표 — 폰 항목 줄은 aria-hidden 글 · 행 머리 th 는 폰에도(sr-only · 폭 0) · 값 칸 headers → 열 머리 + 행 머리", () => {
  const src = strip(read("app/complex/compare/[slug]/page.tsx"));
  assert.doesNotMatch(src, /scope="colgroup"/);
  /* 두 표 안에서 display:none 으로 접근성 표에서 빠지던 칸이 없다 — 폰 · PC 가 같은 열 수 */
  const tables = src.match(/<table className="w-full (?:text-left )?t-body md:min-w-\[4[26]0px\]">[\s\S]*?<\/table>/g) ?? [];
  assert.equal(tables.length, 2);
  for (const t of tables) assert.doesNotMatch(t, /max-md:hidden/);
  const metric = src.slice(src.indexOf("function Metric("), src.indexOf("export default async function"));
  assert.doesNotMatch(metric, /max-md:hidden/);
  /* 폰 항목 줄 — 보이는 글뿐(aria-hidden) · td · 폭 0 칸까지 덮는 colSpan */
  assert.match(metric, /<tr className="md:hidden" aria-hidden="true">\s*<td colSpan=\{3\} className="pt-2\.5 text-left t-caption font-medium text-text-3">/);
  assert.match(src, /<tr className="md:hidden" aria-hidden="true">\s*<td colSpan=\{4\} className="pt-2\.5 text-left t-sub font-bold text-ink">/);
  /* 행 머리 — id · scope=row · 폰은 글만 화면 밖 */
  assert.match(metric, /const rowId = `cmp-sum-\$\{id\}`;/);
  assert.match(metric, /<th id=\{rowId\} scope="row" className="py-2\.5 pr-2 text-left t-sub font-medium text-text-3 max-md:p-0">\s*<span className="block max-md:sr-only">/);
  assert.match(src, /const rowId = `cmp-band-\$\{band\.slug\}`;/);
  assert.match(src, /<th id=\{rowId\} scope="row" className="py-2\.5 text-left font-bold text-ink max-md:p-0">\s*<span className="max-md:sr-only">\{band\.label\}<\/span>\s*<\/th>/);
  /* 열 머리 id — 표마다 다르다(한 쪽 안에서 겹치지 않게) */
  assert.match(src, /const SUM_HEAD = \{ a: "cmp-sum-a", b: "cmp-sum-b" \} as const;/);
  assert.match(src, /const BAND_HEAD = \{ a: "cmp-band-a", b: "cmp-band-b", diff: "cmp-band-diff" \} as const;/);
  for (const ref of ["SUM_HEAD.a", "SUM_HEAD.b", "BAND_HEAD.a", "BAND_HEAD.b", "BAND_HEAD.diff"]) {
    assert.equal((src.match(new RegExp(`<th id=\\{${ref.replace(".", "\\.")}\\}`, "g")) ?? []).length, 1, ref);
  }
  /* 값 칸 — 모두 headers(열 머리 · 행 머리) */
  const headers = src.match(/<td headers=\{`\$\{(SUM_HEAD|BAND_HEAD)\.(a|b|diff)\} \$\{rowId\}`\}/g) ?? [];
  assert.equal(headers.length, 5, "요약 A·B · 면적대 A·B·차이");
  /* 폰 값 줄은 두 칸 그대로(차이 · 첫 칸은 폭 0 · 글 sr-only) */
  assert.match(src, /<th id=\{BAND_HEAD\.diff\} className="py-2 text-right font-medium max-md:p-0">\s*<span className="max-md:sr-only">차이<\/span>/);
  assert.match(src, /<td headers=\{`\$\{BAND_HEAD\.diff\} \$\{rowId\}`\} className="py-2\.5 text-right t-sub text-text-2 max-md:p-0">\s*<span className="max-md:sr-only">/);
  /* Metric 행마다 다른 id */
  const ids = [...src.matchAll(/<Metric\s+id="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["count", "avg", "ppp", "latest", "area", "year"]);
  assert.equal(new Set(ids).size, ids.length);
});
