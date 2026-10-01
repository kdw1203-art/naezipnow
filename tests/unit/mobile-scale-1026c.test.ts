import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [1026c · 폰 글자·상자 90%] 소유자(2026-09-30): "네이버랑 비교해서 글씨 크기나 박스 크기가 조금 작은 것 같아 네이버의 90% 수준으로".
   같은 폰(iPhone 16 Pro · 402pt)에서 잰 글자 높이 — 전: 목록 제목 9.0~10.0pt · 보조 7.3pt(네이버 14.3 · 12.3 의 60~70%).
   후: 배율 1 + 아래 단계로 목록 제목 12.7~14.3 · 보조 11.0~11.3 · 카드 제목 13.7 · 화면 제목 14.7 · 홈 헤드라인 15.0pt. */
const layout = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("폰 배율 1 — 장치(폰 판정·메타 되돌리기·data-mscale·iOS 포커스 확대 막기)는 그대로", () => {
  assert.match(layout, /const MOBILE_SCALE = 1;/);
  assert.match(layout, /document\.documentElement\.setAttribute\('data-mscale',String\(S\)\)/);
});

test("글자 단계 — 폰(data-mscale)에서만, 네이버 90% 에 맞춘 값", () => {
  const i = css.indexOf("[1026c · 폰 글자·상자 90%] 소유자");
  assert.ok(i > 0, "append-only 블록");
  const block = css.slice(i);
  for (const [k, v] of [["--fs-display", "16.5px"], ["--fs-title", "16px"], ["--fs-section", "15.5px"], ["--fs-body", "14px"], ["--fs-sub", "13px"], ["--fs-caption", "12.5px"]]) {
    assert.match(block, new RegExp(`${k}: ${v.replace(".", "\\.")};`), k);
  }
  /* 단계 순서가 뒤집히지 않는다 */
  const px = (k: string) => Number((block.match(new RegExp(`${k}: ([\\d.]+)px`)) ?? [])[1]);
  assert.ok(px("--fs-display") > px("--fs-title") && px("--fs-title") > px("--fs-section") && px("--fs-section") > px("--fs-body") && px("--fs-body") > px("--fs-sub") && px("--fs-sub") > px("--fs-caption"));
  assert.ok(px("--fs-caption") >= 12, "폰 글자 하한");
});

test("탭바 — 화면에서 90%, 위 오프셋도 같은 비율(68 × 0.9 ≈ 61)", () => {
  const block = css.slice(css.indexOf("[1026c · 폰 글자·상자 90%] 소유자"));
  assert.match(block, /html\[data-mscale\] \.tabbar-row \{\s*zoom: 0\.9;/);
  assert.match(block, /--nz-tabbar-offset: calc\(61px \+ env\(safe-area-inset-bottom, 0px\)\);/);
});
