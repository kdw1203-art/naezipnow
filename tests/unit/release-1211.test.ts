/* [1211] 정리정돈 · 지도 반응 · 단지 vs 단지 비교를 지도 팝업으로(비교 화면 삭제) */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

test("단지 vs 단지 — 비교 화면은 지우고 옛 주소는 지도 팝업으로 영구 이동", () => {
  assert.equal(existsSync("app/complex/compare/page.tsx"), false);
  assert.equal(existsSync("app/complex/compare/[slug]/page.tsx"), false);
  assert.equal(existsSync("app/sitemap-pairs.xml/route.ts"), false);
  const cfg = read("next.config.ts");
  assert.match(cfg, /\{ source: "\/complex\/compare", destination: "\/map", permanent: true \}/);
  assert.match(cfg, /\{ source: "\/complex\/compare\/:slug", destination: "\/map\?pair=:slug", permanent: true \}/);
  /* 조합 링크(동 화면 · 단지 화면)는 지도 팝업 주소 */
  assert.match(read("lib/market/complex-pairs.ts"), /return `\/map\?pair=\$\{encodeURIComponent\(slug\)\}`;/);
  assert.doesNotMatch(read("lib/seo/sitemap-slugs.ts"), /"pairs"/);
  assert.doesNotMatch(read("app/components/nav-data.ts"), /\/complex\/compare/);
});

test("지도 팝업 — ?pair= 로 열고 · 같은 계산(complex-pair-stats) · 닫으면 주소에서 지운다", () => {
  const map = read("app/map/map-client.tsx");
  assert.match(map, /new URLSearchParams\(window\.location\.search\)\.get\("pair"\)/);
  assert.match(map, /\{pairSlug && <ComplexPairPopup slug=\{pairSlug\} onClose=\{closePairPopup\} onLocate=\{locatePair\} \/>\}/);
  assert.match(map, /u\.searchParams\.delete\("pair"\)/);
  assert.match(read("app/map/ComplexPairPopup.tsx"), /fetch\(`\/api\/map\/complex-pair\?slug=\$\{encodeURIComponent\(slug\)\}`\)/);
  const api = read("app/api/map/complex-pair/route.ts");
  assert.match(api, /loadComplexPairStats\(slug\)/);
  assert.match(api, /status: 404/);
  assert.match(api, /status: 503/);
  assert.match(read("lib/market/complex-pair-stats.ts"), /const pair = await findComplexPair\(region, parsed\.first, parsed\.second\);/);
});

test("지도 반응 — 다각형은 바뀐 것만 · 짝짓기는 화면 범위와 분리 · 같은 정비구역 목록은 유지 · 조회 범위 격자", () => {
  const nm = read("components/map/NaverMap.tsx");
  assert.match(nm, /if \(have && have\.sig === sig\) \{\s*next\.add\(p\.id\);\s*continue;\s*\}/);
  const map = read("app/map/map-client.tsx");
  assert.match(map, /const redevMatched = useMemo\(/);
  assert.match(map, /setRedevItems\(\(prev\) => \(sameRedevItems\(prev, nextItems\) \? prev : nextItems\)\)/);
  assert.match(map, /const snapped = b\s*\? snapViewportBounds\(b,/);
});

test("정리정돈 — 홈 칸 높이 격자 · 토론 두 칸 같은 높이 · 푸터 PC 한 줄 · 후보 단지 더하기 칸", () => {
  const css = read("app/globals.css");
  assert.match(css, /\.home-flow \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.home-flow-item > :last-child \{\s*flex: 1 1 auto;\s*\}/);
  assert.match(read("app/components/talk/TalkPanel.tsx"), /md:h-\[520px\]/);
  assert.match(read("app/components/Footer.tsx"), /md:grid md:grid-cols-\[200px_minmax\(0,1fr\)\]/);
  assert.match(read("app/analysis/compare/page.tsx"), /비교할 단지 더하기 <span className="tabular-nums text-primary">\{count\}\/\{COMPARE_TRAY_MAX\}<\/span>/);
});
