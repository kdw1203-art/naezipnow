import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

/* [1012 · 폰 배율] 소유자가 시안(지금·80·70·60%)을 보고 60% 를 고른 뒤 "글씨는 75% 로" — 폰에서만 뷰포트 배율(0.75)로
   줄이고 여백은 0.8 배로 더 조이며, 탭바는 85% 로 되돌린다. 아래는 그 장치가 조용히 풀리지 않게 잡는 잠금이다. */
const layout = readFileSync("app/layout.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const tabbar = readFileSync("app/components/TabBar.tsx", "utf8");

test("폰만 — 짧은 변 600px 미만에서만 배율을 건다(태블릿·데스크톱은 그대로)", () => {
  assert.match(layout, /const MOBILE_SCALE = 0\.75;/);
  assert.match(layout, /Math\.min\(screen\.width,screen\.height\);if\(!\(n>0&&n<600\)\)return;/);
});

test("하이드레이션 뒤 Next 가 다시 꽂는 viewport 메타도 같은 값으로 되돌린다", () => {
  assert.match(layout, /new MutationObserver\(fix\)\.observe\(document\.head/);
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: MSCALE_SCRIPT \}\} \/>/);
});

test("iOS 만 maximum-scale — 입력칸 포커스 확대 방지, 안드로이드는 손가락 확대 유지", () => {
  assert.match(layout, /ios\?', initial-scale='\+S\+', minimum-scale='\+S\+', maximum-scale='\+S:''/);
});

test("탭바는 85% — 안쪽 줄만 0.85/0.75 배, 탭바 위 오프셋도 같은 배율", () => {
  assert.match(tabbar, /className="tabbar-row /);
  assert.match(css, /html\[data-mscale\] \.tabbar-row \{\s*zoom: 1\.1333;/);
  assert.match(css, /--nz-tabbar-offset: calc\(77px \+ env\(safe-area-inset-bottom, 0px\)\);/);
});

test("[글씨 75%] 글자는 배율 0.75, 여백은 0.8 배로 더 조여 화면에서 60% · 두세 줄 말줄임은 한 줄로", () => {
  assert.match(css, /html\[data-mscale\] \{\s*--spacing: 3px;/);
  assert.match(css, /html\[data-mscale\] :is\(\.clamp-2, \.line-clamp-2, \.line-clamp-3\) \{\s*-webkit-line-clamp: 1;/);
  assert.match(css, /html\[data-mscale\] :is\(h2, h3, h4\),/);
});
