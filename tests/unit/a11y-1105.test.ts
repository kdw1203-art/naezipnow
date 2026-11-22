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

/* [1211] 단지 vs 단지 비교 화면을 지웠다(지도 팝업) — 그 화면만 보던 검사를 걷었다: 1) 비교 허브 */

test("2) 가로 밀기 줄 — 칩 · 틀 자신의 포커스 링을 안쪽으로(-2px) · 포커스 아닐 때 규칙 없음 · 토큰 규칙", () => {
  const hs = strip(read("app/components/HScroll.tsx"));
  assert.match(hs, /<div\s+ref=\{ref\}\s+data-hscroll=""\s+className=\{`overflow-x-auto /);
  /* [1211] /complex/compare 화면은 지웠다(지도 팝업) */
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

/* [1211] 단지 vs 단지 비교 화면을 지웠다(지도 팝업) — 그 화면만 보던 검사를 걷었다: 3) 비교 표 */
