/* [1085] 소유자 2026-10-22 — "대규모 개선" 3단계: 속도·안정성·비용 + 지도.
 *  운영 실측(Vercel 런타임 오류 7일 · 로그 23시간 · Lighthouse 폰 7화면)에서 나온 것:
 *  사이트맵 6번 조각 503(48회) · 서버 액션 없는 "/" 로 Next-Action POST(21회) · 관공서(Overpass) 9초 시간 초과 반복(23시간 101회) ·
 *  광고 스크립트 6초 타이머가 첫 화면 작업과 겹침(TBT 1,798 → 794ms) · 탭바 다섯 탭 프리페치(마이 = 화면마다 함수 1회) ·
 *  단지 화면 지도(SDK + 타일)가 화면 아래인데 첫 로드에 실림(전송 1,182 → 약 490KB) · 끝없이 도는 장식 움직임 · 푸터 글꼴. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  OSM_BREAKER_FAILS,
  OSM_BREAKER_MESSAGE,
  OSM_BREAKER_OPEN_SEC,
  OSM_BREAKER_WINDOW_SEC,
  memoryBreakerFail,
  memoryBreakerOk,
  memoryBreakerOpen,
  newMemoryBreaker,
  shouldOpenBreaker,
} from "@/lib/map/osm-breaker";
import { naverMapsPreloadUrl, naverMapsScriptUrl } from "@/lib/map/naver-maps-sdk";
import { ADSENSE_MOBILE_DELAY_MS, ADSENSE_WAKE_EVENTS, buildAdSenseBootScript } from "@/lib/ads/adsense-boot";
import { complexChunkRange } from "@/lib/seo/sitemap-slugs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("사이트맵 — 범위 밖 단지 조각은 허브 한 줄(200) · 전체 0개는 그대로 503", () => {
  assert.equal(complexChunkRange(0, 0), "empty", "조회 실패(0개) → 503 유지");
  assert.deepEqual(complexChunkRange(23_809, 0), { start: 0, end: 5000 });
  assert.deepEqual(complexChunkRange(23_809, 4), { start: 20_000, end: 23_809 });
  assert.equal(complexChunkRange(23_809, 5), "hub", "운영 6번째 조각");
  assert.deepEqual(complexChunkRange(30_000, 5), { start: 25_000, end: 30_000 }, "목록이 자라면 다시 단지");
  const src = strip(read("lib/seo/build-sitemap.ts"));
  assert.match(src, /const range = complexChunkRange\(all\.length, chunkIndex\);\s*if \(range === "empty"\) return \[\];\s*if \(range === "hub"\) return \[\{ url: `\$\{BASE_URL\}\/map`, priority: 0\.5 \}\];/);
  /* 조각 1~6 은 required 그대로(인덱스에 늘 싣는다 · 판정 조회 없음) */
  const sec = read("lib/seo/sitemap-sections.ts");
  for (let i = 1; i <= 6; i++) assert.match(sec, new RegExp(`slug: "complexes-${i}", label: "단지 ${i}/6", required: true`));
});

test("서버 액션 — 액션이 있는 화면 경로만 Next-Action POST 를 받는다(나머지는 엣지 400) · 'use server' 파일과 목록이 맞는다", () => {
  const mw = strip(read("middleware.ts"));
  const m = /const SERVER_ACTION_PATHS: readonly string\[\] = \[([^\]]*)\];/.exec(mw);
  assert.ok(m, "목록");
  const listed = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  assert.match(mw, /request\.method === "POST" &&\s*request\.headers\.has\("next-action"\) &&/);
  assert.match(mw, /status: 400/);
  /* app/ 아래 "use server" 파일 → 그 파일이 있는 화면 경로(라우트 묶음 (x) 는 빼고) 가 목록에 있어야 한다 */
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "api" || name === "node_modules") continue;
        walk(p);
      } else if (/\.(ts|tsx)$/.test(name) && /^\s*["']use server["']/m.test(read(p))) {
        const route = "/" + dir.replace(/^app\/?/, "").split("/").filter((s) => s && !/^\(.*\)$/.test(s)).join("/");
        found.push(route === "/" ? "/" : route.replace(/\/$/, ""));
      }
    }
  };
  walk("app");
  assert.ok(found.length >= 1);
  for (const r of found) assert.ok(listed.some((p) => r === p || r.startsWith(`${p}/`)), `${r} 가 SERVER_ACTION_PATHS 에 없다`);
});

test("관공서(Overpass) 차단기 — 10분 창 3번 실패면 15분 묻지 않음 · 성공하면 초기화 · 메모리 하한", () => {
  assert.equal(OSM_BREAKER_FAILS, 3);
  assert.equal(OSM_BREAKER_WINDOW_SEC, 600);
  assert.equal(OSM_BREAKER_OPEN_SEC, 900);
  assert.equal(shouldOpenBreaker(2), false);
  assert.equal(shouldOpenBreaker(3), true);
  assert.equal(shouldOpenBreaker(null), false);
  const b = newMemoryBreaker();
  const t0 = 1_000_000;
  assert.equal(memoryBreakerFail(b, t0), false);
  assert.equal(memoryBreakerFail(b, t0 + 1000), false);
  assert.equal(memoryBreakerFail(b, t0 + 2000), true, "세 번째에 열림");
  assert.equal(memoryBreakerOpen(b, t0 + 2000 + 14 * 60_000), true);
  assert.equal(memoryBreakerOpen(b, t0 + 2000 + 15 * 60_000 + 1), false, "15분 뒤 닫힘");
  memoryBreakerOk(b);
  assert.equal(memoryBreakerOpen(b, t0 + 3000), false);
  /* 창이 지나면 다시 센다 */
  const c = newMemoryBreaker();
  memoryBreakerFail(c, t0);
  memoryBreakerFail(c, t0 + 1000);
  assert.equal(memoryBreakerFail(c, t0 + 11 * 60_000), false);
  const load = strip(read("lib/map/area-load.ts"));
  assert.match(load, /if \(await osmBreakerOpen\(\)\) throw new Error\(OSM_BREAKER_MESSAGE\);/);
  assert.match(load, /await osmBreakerOk\(\);\s*return parsed;/);
  assert.match(load, /await osmBreakerFail\(\);\s*throw new Error\(/);
  assert.match(load, /kvIncrWindow\(OSM_BREAKER_FAIL_KEY, OSM_BREAKER_WINDOW_SEC\)/);
  assert.match(OSM_BREAKER_MESSAGE, /일시 중단/);
  assert.match(strip(read("app/api/complex/area/route.ts")), /logger\.warnSampled\("area-osm-paused"/);
});

test("단지 화면 지도 — 뷰포트 600px 앞에서 받는다(SDK·타일·주변 조회) · 자리 높이 380px 그대로", () => {
  const src = strip(read("app/complex/[id]/ComplexAreaMapLazy.tsx"));
  assert.match(src, /const near = useNearViewport\(ref, "600px 0px"\);/);
  assert.match(src, /\{near \? <ComplexAreaMap \{\.\.\.props\} \/> : <AreaMapPlaceholder \/>\}/);
  assert.match(src, /className="card h-\[380px\] rounded-2xl"/);
});

test("광고 — 폰은 첫 스크롤·터치 또는 20초 뒤(6초 → 20초) · 데스크톱은 그대로 즉시", () => {
  assert.equal(ADSENSE_MOBILE_DELAY_MS, 20_000);
  assert.deepEqual([...ADSENSE_WAKE_EVENTS], ["scroll", "pointerdown", "keydown", "touchstart"]);
  const boot = buildAdSenseBootScript("ca-pub-0", ["/my"]);
  assert.match(boot, /setTimeout\(go,20000\)/);
  assert.match(boot, /matchMedia\("\(min-width: 1024px\)"\)\.matches\)\{add\(\);return;\}/);
});

test("탭바 — 기본 프리페치 끔 · 손이 닿을 때 받음 · 정적 탭은 첫 입력 뒤 쉬는 시간(마이 제외) · 폰에서만", () => {
  const src = strip(read("app/components/TabBar.tsx"));
  assert.equal((src.match(/prefetch=\{false\}/g) ?? []).length, 2, "가운데 기록 + 나머지 네 탭");
  assert.equal((src.match(/onTouchStart=\{intent\(tab\.href\)\}/g) ?? []).length, 2);
  assert.match(src, /const TAB_IDLE_PREFETCH = \["\/", "\/map", "\/notes\/new", "\/town"\] as const;/);
  assert.doesNotMatch(src.slice(src.indexOf("TAB_IDLE_PREFETCH"), src.indexOf("TAB_PREFETCH_WAKE")), /\/my/);
  assert.match(src, /const TAB_PREFETCH_FALLBACK_MS = 15_000;/);
  assert.match(src, /window\.matchMedia\("\(max-width: 767px\)"\)\.matches\) return;/);
});

test("지도 화면 — maps.js 미리 받기(클라이언트 주입과 같은 주소) · 키 없으면 생략", () => {
  const url = naverMapsPreloadUrl("abc123");
  assert.equal(url, naverMapsScriptUrl("abc123", "__woodongNaverMapsReady"));
  assert.match(url, /^https:\/\/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?ncpKeyId=abc123/);
  const page = strip(read("app/map/page.tsx"));
  assert.match(page, /\{ncpKeyId \? <link rel="preload" as="script" href=\{naverMapsPreloadUrl\(ncpKeyId\)\} \/> : null\}/);
});

test("끝없는 움직임 · 푸터 — 시머 4번 · 고리 3번 · 배경 블롭 제자리 · 푸터 content-visibility", () => {
  const css = read("app/globals.css");
  const tail = css.slice(css.lastIndexOf("[1085 · 속도] 끝없이 도는 장식 움직임 줄이기"));
  assert.match(tail, /\.skeleton \{\s*animation-iteration-count: 4;\s*\}/);
  assert.match(tail, /\.njn-fab::after \{\s*animation-iteration-count: 3;\s*\}/);
  assert.match(tail, /body::before,\s*body::after \{\s*animation: none;\s*\}/);
  assert.match(tail, /footer\.footer-cv \{\s*content-visibility: auto;\s*contain-intrinsic-size: auto 760px;\s*\}/);
  assert.doesNotMatch(tail, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8|font-size:\s*\d/);
  assert.match(read("app/components/Footer.tsx"), /<footer className="footer-cv mt-auto /);
});

test("오류 화면 문구 — 해요체 → '○○ 불러오기 실패'(결제·구독 화면은 심사 고정이라 그대로)", () => {
  assert.match(read("app/map/error.tsx"), /title="지도 화면 불러오기 실패"/);
  assert.match(read("app/notes/error.tsx"), /title="임장노트 화면 불러오기 실패"/);
  assert.doesNotMatch(read("app/notes/error.tsx"), /있어요/);
  assert.match(read("app/payment/error.tsx"), /결제 결과 화면에 문제가 생겼어요/, "심사 고정 — 바꾸지 않는다");
});
