import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  ELEMENT_MAX,
  formatAttribution,
  inpSubpartsSuffix,
  lcpSubpartsSuffix,
} from "../../lib/metrics/vitals-attribution.ts";
import {
  OFFLINE_ASSET_MAX,
  STATIC_CACHE_MAX_ENTRIES,
  extractOfflineAssetUrls,
  isStaticAssetRequest,
  overflowKeys,
  shouldPruneCache,
} from "../../lib/pwa/sw-rules.ts";

/* [968 · 42·43] 서비스워커 캐시 규칙 — TS 모듈과 sw.js 미러 블록의 동작 일치 ·
   [968 · 44] 매니페스트 · [968 · 45] 배지 PNG 형식 · [968 · 49] INP 하위 구간 꼬리.
   브라우저 없이 검증 가능한 순수 함수·정적 파일만 본다. */

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const ORIGIN = "https://naezipnow.com";

/* ---------- [968 · 43] 정적 자산 판정 ---------- */

const STATIC_CASES: Array<[string, boolean]> = [
  ["/_next/static/css/6b95a567193a3341.css", true],
  ["/_next/static/chunks/app/layout-3bfb9dc8c54535b9.js", true],
  ["/_next/static/media/pretendard.woff2", true],
  ["/icons/icon-192.png", true],
  ["/icons/badge-96.png", true],
  ["/fonts/anything.woff2", true],
  ["/manifest.webmanifest", true],
  ["/manifest.webmanifest?v=2", true],
  ["/", false],
  ["/notes", false],
  ["/complex/abc", false],
  ["/api/metrics/web-vitals", false],
  ["/api/health", false],
  ["/_next/image?url=%2Fx.png&w=640&q=75", false],
  ["/_next/data/build/notes.json", false],
  ["/sw.js", false],
  ["/offline", false],
  ["/iconsx/icon.png", false],
  ["/manifest.webmanifest/extra", false],
  ["https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/x.css", false],
  ["https://fonts.googleapis.com/css2?family=Noto+Serif+KR", false],
  ["https://evil.example/_next/static/chunks/x.js", false],
];

test("[968 · 43] isStaticAssetRequest — 해시 파일·아이콘·폰트·매니페스트만, HTML·API·_next/image·외부는 아님", () => {
  for (const [input, expected] of STATIC_CASES) {
    assert.equal(isStaticAssetRequest(input, ORIGIN), expected, input);
    // URL 객체를 넘겨도 같은 답
    assert.equal(isStaticAssetRequest(new URL(input, ORIGIN), ORIGIN), expected, `URL ${input}`);
  }
  // 깨진 입력은 조용히 false (SW 가 죽으면 안 된다)
  assert.equal(isStaticAssetRequest("http://[bad", ORIGIN), false);
});

test("[968 · 43] shouldPruneCache / overflowKeys — 상한 초과분만, 오래된(앞쪽) 것부터", () => {
  assert.equal(STATIC_CACHE_MAX_ENTRIES, 150);
  assert.equal(shouldPruneCache(150), false);
  assert.equal(shouldPruneCache(151), true);
  assert.equal(shouldPruneCache(0), false);
  assert.equal(shouldPruneCache(Number.NaN), false);
  assert.equal(shouldPruneCache(5, 4), true);

  const keys = Array.from({ length: 153 }, (_, i) => `k${i}`);
  assert.deepEqual(overflowKeys(keys), ["k0", "k1", "k2"]);
  assert.deepEqual(overflowKeys(keys.slice(0, 150)), []);
  assert.deepEqual(overflowKeys([], 10), []);
  assert.deepEqual(overflowKeys(["a", "b", "c"], 1), ["a", "b"]);
});

/* ---------- [968 · 42] 오프라인 문서에서 precache 할 자산 뽑기 ---------- */

/* 경로는 상수로 빼서 보간한다 — check-route-links 는 소스에 리터럴로 적힌 링크 속성값을
   라우트로 보는데, 이건 파서 픽스처지 링크가 아니다. */
const CSS_MAIN = "/_next/static/css/6b95a567193a3341.css";
const CSS_SWAPPED = "/_next/static/css/order-swapped.css";
const JS_PRELOAD = "/_next/static/chunks/preload-only.js";
const JS_POLYFILL = "/_next/static/chunks/polyfills-42372ed130431b0a.js";
const JS_WEBPACK = "/_next/static/chunks/webpack-d3a3a1006304053b.js";
const JS_MAIN = "/_next/static/chunks/main-app-74e9ad51d4876878.js";
const OFFLINE_HTML = `<!DOCTYPE html><html lang="ko"><head>
<link rel="stylesheet" href="${CSS_MAIN}" data-precedence="next"/>
<link id="pretendard-font" rel="stylesheet" href="${"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/x.css"}" media="print"/>
<link href="${CSS_SWAPPED}" rel='stylesheet'>
<link rel="preload" as="script" href="${JS_PRELOAD}"/>
<link rel="icon" href="${"/favicon.ico"}"/>
<script src="${JS_POLYFILL}" nomodule=""></script>
<script src="${JS_WEBPACK}" async=""></script>
<script src="${JS_MAIN}" async=""></script>
<script src="${JS_MAIN}" async=""></script>
<script src="https://pagead2.googlesyndication.com/x.js" async></script>
<script>window.adsbygoogle=[]</script>
<link rel="stylesheet" href="${CSS_MAIN}"/>
</head><body></body></html>`;

test("[968 · 42] extractOfflineAssetUrls — 스타일시트·모듈 스크립트만, 외부·nomodule·preload 제외, 중복 제거", () => {
  assert.deepEqual(extractOfflineAssetUrls(OFFLINE_HTML), [CSS_MAIN, CSS_SWAPPED, JS_WEBPACK, JS_MAIN]);
  assert.deepEqual(extractOfflineAssetUrls(""), []);
  assert.deepEqual(extractOfflineAssetUrls("<p>no head</p>"), []);
  // 상한 — 설치 비용을 묶는다
  const many = Array.from(
    { length: OFFLINE_ASSET_MAX + 5 },
    (_, i) => `<script src="/_next/static/chunks/c${i}.js"></script>`,
  ).join("");
  assert.equal(extractOfflineAssetUrls(many).length, OFFLINE_ASSET_MAX);
  assert.equal(extractOfflineAssetUrls(many, 3).length, 3);
});

/* ---------- [968 · 43] sw.js 미러 블록이 TS 모듈과 같은 답을 내는가 ---------- */

type SwRules = {
  STATIC_CACHE_MAX_ENTRIES: number;
  OFFLINE_ASSET_MAX: number;
  isStaticAssetRequest: (url: string | URL, origin: string) => boolean;
  shouldPruneCache: (n: number, max?: number) => boolean;
  overflowKeys: <T>(keys: readonly T[], max?: number) => T[];
  extractOfflineAssetUrls: (html: string, max?: number) => string[];
};

function loadSwRulesBlock(): SwRules {
  const src = read("public/sw.js");
  const begin = src.indexOf("sw-rules:begin");
  const end = src.indexOf("/* sw-rules:end */");
  assert.ok(begin > 0 && end > begin, "sw.js 에 sw-rules:begin/end 표식이 있어야 한다");
  const blockStart = src.indexOf("*/", begin) + 2;
  const block = src.slice(blockStart, end);
  const factory = new Function(
    `${block}
     return { STATIC_CACHE_MAX_ENTRIES, OFFLINE_ASSET_MAX, isStaticAssetRequest, shouldPruneCache, overflowKeys, extractOfflineAssetUrls };`,
  );
  return factory() as SwRules;
}

test("[968 · 43] sw.js 미러 블록 = lib/pwa/sw-rules.ts (같은 입력표, 같은 출력)", () => {
  const sw = loadSwRulesBlock();
  assert.equal(sw.STATIC_CACHE_MAX_ENTRIES, STATIC_CACHE_MAX_ENTRIES);
  assert.equal(sw.OFFLINE_ASSET_MAX, OFFLINE_ASSET_MAX);
  for (const [input] of STATIC_CASES) {
    assert.equal(sw.isStaticAssetRequest(input, ORIGIN), isStaticAssetRequest(input, ORIGIN), input);
  }
  assert.equal(sw.isStaticAssetRequest("http://[bad", ORIGIN), false);
  for (const n of [0, 149, 150, 151, 400, Number.NaN]) {
    assert.equal(sw.shouldPruneCache(n), shouldPruneCache(n), `prune ${n}`);
  }
  const keys = Array.from({ length: 160 }, (_, i) => i);
  assert.deepEqual(sw.overflowKeys(keys), overflowKeys(keys));
  assert.deepEqual(sw.overflowKeys(keys, 200), overflowKeys(keys, 200));
  assert.deepEqual(sw.extractOfflineAssetUrls(OFFLINE_HTML), extractOfflineAssetUrls(OFFLINE_HTML));
  assert.deepEqual(sw.extractOfflineAssetUrls(OFFLINE_HTML, 2), extractOfflineAssetUrls(OFFLINE_HTML, 2));
});

test("[968 · 43] sw.js — 버전 캐시 이름·activate 정리·navigate 정책·정적 cache-first 배선", () => {
  const src = read("public/sw.js");
  assert.match(src, /const CACHE_VERSION = "v3"/);
  assert.match(src, /nuguzip-precache-/);
  assert.match(src, /nuguzip-static-/);
  assert.match(src, /KEEP_CACHES\.includes\(k\)/, "옛 버전 캐시를 지우는 activate 필터");
  assert.match(src, /pruneStaticCache\(\)/);
  assert.match(src, /req\.mode === "navigate"/, "페이지 이동은 네트워크 우선 그대로");
  assert.match(src, /isStaticAssetRequest\(new URL\(req\.url\), self\.location\.origin\)/);
  assert.match(src, /!type\.includes\("text\/html"\)/, "HTML 은 정적 캐시에 넣지 않는다");
  assert.match(src, /extractOfflineAssetUrls\(html\)/, "[968 · 42] 폴백 문서의 CSS/JS 도 precache");
  // 구 sw-v2 캐시 이름을 남겨 두면 activate 가 못 지운다
  assert.doesNotMatch(src, /"nuguzip-sw-v2"/);
});

/* ---------- [968 · 44 · 45] 매니페스트 · 배지 PNG ---------- */

function pngSize(file: string): { w: number; h: number; colorType: number; bytes: number } {
  const buf = readFileSync(path.join(ROOT, file));
  assert.equal(buf.toString("latin1", 1, 4), "PNG", `${file} 는 PNG 여야 한다`);
  assert.equal(buf.toString("latin1", 12, 16), "IHDR");
  return {
    w: buf.readUInt32BE(16),
    h: buf.readUInt32BE(20),
    colorType: buf[25],
    bytes: statSync(path.join(ROOT, file)).size,
  };
}

test("[968 · 45] 배지 아이콘 — 96×96 · 알파 채널(RGBA) · sw.js 가 가리킨다", () => {
  const badge = pngSize("public/icons/badge-96.png");
  assert.equal(badge.w, 96);
  assert.equal(badge.h, 96);
  /* colorType 6 = RGBA, 4 = GrayAlpha — 안드로이드는 알파만 마스크로 쓰므로 투명 배경이 필수 */
  assert.ok(badge.colorType === 6 || badge.colorType === 4, `alpha 채널 필요(colorType=${badge.colorType})`);
  assert.ok(badge.bytes < 10_000, "배지는 몇 KB 면 충분하다");
  const sw = read("public/sw.js");
  assert.match(sw, /badge: "\/icons\/badge-96\.png"/);
  assert.doesNotMatch(sw, /badge: "\/icons\/icon-192\.png"/);
});

test("[968 · 44] 매니페스트 — id · display_override · orientation 제거 · screenshots(narrow/wide, 실파일)", () => {
  const m = JSON.parse(read("public/manifest.webmanifest")) as {
    id?: string;
    start_url?: string;
    display?: string;
    display_override?: string[];
    orientation?: string;
    share_target?: unknown;
    screenshots?: Array<{ src: string; sizes: string; type: string; form_factor?: string; label?: string }>;
  };
  assert.equal(m.id, "/");
  assert.equal(m.start_url, "/");
  assert.equal(m.display, "standalone");
  assert.deepEqual(m.display_override, ["standalone", "minimal-ui"]);
  assert.equal(m.orientation, undefined, "가로 잠금은 풀었다 — 태블릿·폴더블에서 강제 회전이 더 나쁘다");
  assert.equal(m.share_target, undefined, "share_target 은 범위 밖");

  const shots = m.screenshots ?? [];
  assert.equal(shots.length, 2);
  const byForm = Object.fromEntries(shots.map((s) => [s.form_factor, s]));
  assert.ok(byForm.narrow && byForm.wide, "narrow·wide 한 장씩");
  for (const s of shots) {
    assert.ok(s.src.startsWith("/icons/screenshot-"), s.src);
    const file = `public${s.src}`;
    const png = pngSize(file);
    assert.equal(s.type, "image/png");
    assert.equal(s.sizes, `${png.w}x${png.h}`, `${s.src} sizes 가 실제 픽셀과 다르다`);
    assert.ok(png.bytes < 300_000, `${s.src} ${png.bytes}B — 300KB 이하`);
    assert.ok(typeof s.label === "string" && s.label.length > 0, "label 은 접근성 대체 텍스트");
  }
  /* 설치 다이얼로그 규격: narrow 는 세로(폭<높이), wide 는 가로. 종횡비 폭:높이 ≤ 2.3 */
  const narrow = pngSize(`public${byForm.narrow.src}`);
  const wide = pngSize(`public${byForm.wide.src}`);
  assert.ok(narrow.w < narrow.h, "narrow 는 세로 화면");
  assert.ok(wide.w > wide.h && wide.w / wide.h <= 2.3, "wide 는 가로 화면(종횡비 2.3 이내)");
});

/* ---------- [968 · 49] Web Vitals attribution → element 문자열 ---------- */

test("[968 · 49] INP — 하위 구간 id·pd·prd·ls 를 꼬리에 접는다(정수 ms, 없는 값은 생략)", () => {
  const r = formatAttribution({
    name: "INP",
    attribution: {
      interactionTarget: "#hero button.search",
      interactionType: "pointer",
      inputDelay: 12.4,
      processingDuration: 301.6,
      presentationDelay: 40.2,
      loadState: "complete",
      longAnimationFrameEntries: [],
      processedEventEntries: [],
    },
  });
  assert.equal(r.element, "#hero button.search (pointer) |id=12 pd=302 prd=40 ls=complete");
  assert.equal(r.attrUrl, null);

  // 값이 일부만 있어도 있는 것만 — 지어내지 않는다
  assert.equal(
    inpSubpartsSuffix({ inputDelay: 3, loadState: "dom-interactive" }),
    " |id=3 ls=dom-interactive",
  );
  assert.equal(inpSubpartsSuffix({}), "");
  // 이상한 loadState(공백·구분자)는 버린다 — 꼬리 파서 보호
  assert.equal(inpSubpartsSuffix({ inputDelay: 1, loadState: "weird state|x" }), " |id=1");
  assert.equal(inpSubpartsSuffix({ inputDelay: Number.NaN, processingDuration: Infinity }), "");
});

test("[968 · 49] INP — 대상이 빈 문자열(DOM 에서 사라짐)이어도 하위 구간은 남긴다", () => {
  const r = formatAttribution({
    name: "INP",
    attribution: { interactionTarget: "", inputDelay: 5, processingDuration: 500, presentationDelay: 60, loadState: "complete" },
  });
  assert.equal(r.element, " |id=5 pd=500 prd=60 ls=complete");
  // 대상도 하위 구간도 없으면 null
  assert.equal(formatAttribution({ name: "INP", attribution: { interactionTarget: "" } }).element, null);
});

test("[968 · 49] 256자 상한 — 선택자 쪽을 자르고 꼬리는 온전히 남긴다", () => {
  const longTarget = "div.a > ".repeat(60) + "button"; // > 256
  const r = formatAttribution({
    name: "INP",
    attribution: {
      interactionTarget: longTarget,
      interactionType: "keyboard",
      inputDelay: 100,
      processingDuration: 200,
      presentationDelay: 300,
      loadState: "loading",
    },
  });
  assert.ok(r.element !== null);
  assert.equal(r.element!.length, ELEMENT_MAX);
  assert.ok(r.element!.endsWith(" |id=100 pd=200 prd=300 ls=loading"));

  const lcp = formatAttribution({
    name: "LCP",
    attribution: { target: longTarget, timeToFirstByte: 450.4, elementRenderDelay: 1200, url: "https://naezipnow.com/x.jpg" },
  });
  assert.equal(lcp.element!.length, ELEMENT_MAX);
  assert.ok(lcp.element!.endsWith(" |ttfb=450 erd=1200"));
  assert.equal(lcp.attrUrl, "https://naezipnow.com/x.jpg");
});

test("[967 · 29b] LCP/CLS/FCP 동작은 그대로 — 회귀 없음", () => {
  assert.equal(
    formatAttribution({ name: "LCP", attribution: { target: "img.hero", timeToFirstByte: 450, resourceLoadDelay: 0, resourceLoadDuration: 0, elementRenderDelay: 1200 } }).element,
    "img.hero |ttfb=450 rld=0 rldur=0 erd=1200",
  );
  // 옛 필드명(element)도 읽는다
  assert.equal(formatAttribution({ name: "LCP", attribution: { element: "h1" } }).element, "h1");
  assert.equal(lcpSubpartsSuffix({}), "");
  assert.equal(formatAttribution({ name: "CLS", attribution: { largestShiftTarget: "section.feed" } }).element, "section.feed");
  assert.deepEqual(formatAttribution({ name: "FCP", attribution: { timeToFirstByte: 100, firstByteToFCP: 300 } }), { element: null, attrUrl: null });
  assert.deepEqual(formatAttribution({ name: "TTFB", attribution: undefined }), { element: null, attrUrl: null });
});
