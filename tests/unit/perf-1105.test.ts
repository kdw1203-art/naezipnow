/* [1105] 속도 3차 — 페이지 전환 페이드(class → body.animate · body 자식 재계산) · 테마 class 마운트 쓰기 없애기 ·
 *  단지 화면 면적 글자의 Suspense 경계 걷기. 실측(1104 빌드 localhost · 운영 단지 화면 · 폰 390 · CPU 4배)은 각 소스 주석에 있다.
 *  .tsx 는 글자로 읽고, 인라인 스크립트는 next-themes 원본 스크립트와 나란히 실행해 본다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { applyThemeClass, THEME_CLASSES } from "@/app/components/ThemeProviderClass";
import { areaTextM2, cookieSaysPyeong } from "@/app/complex/[id]/area-text-m2";
import { formatAreaByUnit, readAreaUnitCookie } from "@/lib/prefs/area-unit";
import { areaBandLabelByUnit } from "@/lib/complex/area-band-label";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk("app"), ...walk("components"), ...walk("lib")];

/** globals.css 의 :root 토큰 한 줄 값 */
function token(css: string, name: string): string {
  const m = css.match(new RegExp(`\\n\\s*${name.replace(/-/g, "\\-")}:\\s*([^;]+);`));
  assert.ok(m, name);
  return m[1]!.trim();
}

/* ───────────── A. 페이지 전환 — class 대신 body.animate() · 같은 키프레임 · 시간 · 곡선 ───────────── */
test("A 페이지 전환 — body 에 class/속성을 쓰지 않고 animate() · 값은 예전 .page-enter(토큰)와 같다 · 모션 최소화", () => {
  const raw = read("app/components/motion/PageTransition.tsx");
  const code = strip(raw);
  assert.doesNotMatch(code, /classList|page-enter|offsetWidth|setAttribute|setTimeout/, "body class 붙였다 떼기 · 강제 리플로우 · 600ms 타이머 없음");
  assert.match(code, /const anim = body\.animate\(reduce \? REDUCED_FADE : PAGE_FADE, \{\s*duration: reduce \? REDUCED_FADE_MS : PAGE_FADE_MS,\s*easing: reduce \? REDUCED_FADE_EASING : PAGE_FADE_EASING,\s*\}\);/);
  assert.doesNotMatch(code, /fill:/, "끝나면 스스로 빠진다(예전 fill both 의 끝값도 opacity 1 — body 에는 다른 opacity 규칙이 없다)");
  assert.match(code, /return \(\) => anim\.cancel\(\);\s*\}, \[pathname\]\);/, "다시 이동하면 걷고 처음부터(예전 재시작과 같음)");
  assert.match(code, /if \(typeof body\.animate !== "function"\) return;/);
  assert.match(code, /window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);

  /* 값 — 예전 CSS: @keyframes pageFade { from .45 to 1 } · animation: pageFade var(--dur-page) var(--ease-out) both */
  assert.match(code, /const PAGE_FADE: Keyframe\[\] = \[\{ opacity: 0\.45 \}, \{ opacity: 1 \}\];/);
  const css = read("app/globals.css");
  assert.equal(token(css, "--dur-page"), "var(--dur-md)");
  const durMd = token(css, "--dur-md").replace(/\s*\/\*.*$/, "");
  assert.equal(durMd, "300ms");
  assert.match(code, /const PAGE_FADE_MS = 300;/);
  assert.equal(token(css, "--ease-out").replace(/\s*\/\*.*$/, ""), "cubic-bezier(0.2, 0.8, 0.2, 1)");
  assert.match(code, /const PAGE_FADE_EASING = "cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)";/);
  /* 모션 최소화 — 예전 reduce 블록: animation: fadeIn 150ms ease both · fadeIn = opacity 0 → 1 */
  assert.match(css, /@keyframes fadeIn \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 1;\s*\}\s*\}/);
  assert.match(code, /const REDUCED_FADE: Keyframe\[\] = \[\{ opacity: 0 \}, \{ opacity: 1 \}\];\s*const REDUCED_FADE_MS = 150;\s*const REDUCED_FADE_EASING = "ease";/);
  const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .moment-layer,"));
  assert.match(reduce, /^@media \(prefers-reduced-motion: reduce\) \{\s*\.moment-layer,\s*\.moment-card,\s*\[data-reveal="shown"\] \{\s*animation: fadeIn 150ms ease both;/, "나머지 목록은 그대로");

  /* .page-enter 를 기대하는 곳이 남지 않았다(규칙 · 키프레임 · 다른 소스) */
  for (const f of SOURCES) assert.doesNotMatch(strip(read(f)), /\.page-enter\b|"page-enter"|@keyframes pageFade/, f);
  assert.match(read("app/layout.tsx"), /<PageTransition \/>/);
});

test("A2 body 직계 링크 — text-decoration 을 inherit 대신 none(같은 값) · base 레이어 · 파일 끝 1104 뒤 · 토큰 규칙", () => {
  const css = read("app/globals.css");
  const at = css.indexOf("[1105 · 속도] body 의 직계 자식 링크");
  assert.ok(at > css.indexOf("[1104 · 속도] 위 리퀴드 판"), "1104 끝 블록 뒤에 덧붙임");
  const block = css.slice(at, css.indexOf("}\n}", at) + 3);
  assert.match(block, /\*\/\n@layer base \{\n {2}body > a \{\n {4}text-decoration: none;\n {2}\}\n\}$/);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|gradient|font-weight:\s*8|font-size:/);
  /* 원인 — Tailwind preflight 의 a { text-decoration: inherit } (상속 안 되는 속성) · 그 자리의 링크는 본문 바로가기 */
  assert.match(read("node_modules/tailwindcss/preflight.css"), /a \{\s*color: inherit;\s*-webkit-text-decoration: inherit;\s*text-decoration: inherit;\s*\}/);
  const layout = strip(read("app/layout.tsx"));
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: CONSENT_BODY_SCRIPT \}\} \/>\s*(?:\{\}\s*)*<a\s+href="#main-content"/, "body 의 직계 자식 a");
  /* body 에 밑줄이 없다(inherit 과 none 이 같은 값) — body 규칙 · body class 에 text-decoration 없음 */
  for (const m of css.matchAll(/(?:^|\n)body[^{,]*\{([^}]*)\}/g)) assert.doesNotMatch(m[1]!, /text-decoration/);
  assert.doesNotMatch(layout.match(/<body className="([^"]*)"/)![1]!, /underline|decoration/);
});

/* ───────────── B. 테마 class — 인라인 스크립트가 달고, 바뀔 때만 쓴다 ───────────── */
function layoutScript(name: string): string {
  const m = read("app/layout.tsx").match(new RegExp(`const ${name} =\\s*"([^"\\\\]*)";`));
  assert.ok(m, name);
  return m[1]!;
}

/** 브라우저 DOMTokenList 흉내 — 순서 유지 · 빈/공백 토큰은 던진다 · 쓰기 횟수(같은 값이어도 센다) */
function fakeClassList(initial: string[]) {
  const list = [...initial];
  let writes = 0;
  const check = (t: string) => {
    if (t === "") throw new SyntaxError("empty token");
    if (/\s/.test(t)) throw new Error("InvalidCharacterError");
  };
  return {
    list,
    get writes() {
      return writes;
    },
    contains: (t: string) => list.includes(t),
    add: (...ts: string[]) => {
      ts.forEach(check);
      for (const t of ts) if (!list.includes(t)) list.push(t);
      writes++;
    },
    remove: (...ts: string[]) => {
      ts.forEach(check);
      for (const t of ts) {
        const i = list.indexOf(t);
        if (i >= 0) list.splice(i, 1);
      }
      writes++;
    },
  };
}

/** next-themes 0.4 의 인라인 스크립트 함수(M) 그대로 */
function nextThemesScript(): string {
  const dist = read("node_modules/next-themes/dist/index.mjs");
  const start = dist.indexOf("var M=(e,i,s,u,m,a,l,h)=>{");
  const end = dist.indexOf("};var b=", start);
  assert.ok(start >= 0 && end > start, "next-themes 스크립트 모양이 바뀌었다 — 이 테스트와 THEME_CLASS_SCRIPT 를 다시 맞출 것");
  return dist.slice("var M=".length + start, end + 1);
}

function runScript(js: string, opts: { stored: string | null | "throw"; osDark: boolean; initial: string[] }) {
  const cl = fakeClassList(opts.initial);
  const style: Record<string, string> = {};
  const document = { documentElement: { classList: cl, style, setAttribute: () => {} } };
  const localStorage = {
    getItem: (k: string) => {
      if (opts.stored === "throw") throw new Error("blocked");
      return k === "theme" ? opts.stored : null;
    },
  };
  const window = { matchMedia: (q: string) => ({ matches: q === "(prefers-color-scheme: dark)" && opts.osDark }) };
  new Function("document", "localStorage", "window", js)(document, localStorage, window);
  return { cls: cl.list.join(" "), colorScheme: style.colorScheme };
}

test("B 테마 첫 그림 — THEME_CLASS_SCRIPT 는 종전 next-themes 스크립트(attribute=class)와 같은 class · next-themes 스크립트는 이제 color-scheme 만", () => {
  const mine = layoutScript("THEME_CLASS_SCRIPT");
  const M = nextThemesScript();
  /* _ 컴포넌트가 넣던 인자: [attribute, storageKey, defaultTheme, forcedTheme, themes, value, enableSystem, enableColorScheme] */
  const oldArgs = JSON.stringify(["class", "theme", "light", undefined, ["light", "dark"], undefined, true, true]).slice(1, -1);
  const newArgs = JSON.stringify([[], "theme", "light", undefined, ["light", "dark"], undefined, true, true]).slice(1, -1);
  const stores: Array<string | null | "throw"> = [null, "", "light", "dark", "system", "foo", "a b", "throw"];
  for (const stored of stores) {
    for (const osDark of [false, true]) {
      for (const initial of [["h-full", "antialiased"], ["h-full", "antialiased", "dark"]]) {
        const label = `${String(stored)} · os ${osDark ? "dark" : "light"} · ${initial.join(" ")}`;
        const before = runScript(`(${M})(${oldArgs})`, { stored, osDark, initial });
        const now = runScript(mine, { stored, osDark, initial });
        assert.equal(now.cls, before.cls, label);
        /* next-themes 스크립트(빈 attribute)는 class 를 건드리지 않고 color-scheme 은 종전과 같다 */
        const lib = runScript(`(${M})(${newArgs})`, { stored, osDark, initial });
        assert.equal(lib.cls, initial.join(" "), label);
        assert.equal(lib.colorScheme, before.colorScheme, label);
      }
    }
  }
  /* head 에서 다른 인라인 스크립트보다 먼저 · <html> 은 suppressHydrationWarning 그대로 */
  const layout = strip(read("app/layout.tsx"));
  assert.match(layout, /<head>\s*(?:\{\}\s*)*<script dangerouslySetInnerHTML=\{\{ __html: THEME_CLASS_SCRIPT \}\} \/>\s*(?:\{\}\s*)*<script dangerouslySetInnerHTML=\{\{ __html: LOWEND_SCRIPT \}\} \/>/);
  assert.match(layout, /<html lang="ko" className="h-full antialiased" suppressHydrationWarning>/);
});

test("B2 테마 런타임 — next-themes 는 class 를 안 쓰고(attribute=[]) · 바뀔 때만 applyThemeClass · OS 변경은 리스너에서 바로", () => {
  /* next-themes 0.4: 효과(S)와 스크립트 모두 attribute 배열을 forEach — 빈 배열이면 class 쓰기가 없다 */
  const dist = read("node_modules/next-themes/dist/index.mjs");
  assert.ok(dist.includes("Array.isArray(h)?h.forEach(L):L(h)"), "효과의 class 쓰기는 attribute 목록을 돈다");
  assert.ok(dist.includes("(Array.isArray(e)?e:[e]).forEach(y=>{"), "스크립트도 같다");
  assert.ok(dist.includes("P.style.colorScheme=D"), "color-scheme 은 그대로 next-themes 가 쓴다");

  const code = strip(read("app/components/ThemeProvider.tsx"));
  assert.match(code, /const NO_THEME_ATTRIBUTE: Attribute\[\] = \[\];/);
  assert.match(code, /<NextThemeProvider attribute=\{NO_THEME_ATTRIBUTE\} defaultTheme="light" enableSystem>\s*<ThemeClassSync \/>\s*\{children\}\s*<\/NextThemeProvider>/);
  assert.match(code, /function ThemeClassSync\(\) \{\s*const \{ resolvedTheme \} = useTheme\(\);\s*useEffect\(\(\) => \{\s*if \(resolvedTheme\) applyThemeClass\(resolvedTheme\);\s*\}, \[resolvedTheme\]\);\s*return null;\s*\}/);
  assert.match(code, /if \(localStorage\.getItem\(THEME_STORAGE_KEY\) !== "system"\) return;[\s\S]*?suppressThemeTransitions\(\);\s*applyThemeClass\(mq\?\.matches \? "dark" : "light"\);/, "OS 변경 — 같은 이벤트 안에서 끄기 → class");
  assert.match(code, /import \{ applyThemeClass \} from "\.\/ThemeProviderClass";/);
  /* 테마 class 를 쓰는 곳은 인라인 스크립트와 applyThemeClass 둘뿐 */
  const writers = SOURCES.filter((f) => /classList\.(?:add|remove|toggle)\([^)]*["'](?:dark|light)["']|THEME_CLASSES/.test(strip(read(f)))).map((f) => f.replace(/\\/g, "/")).sort();
  assert.deepEqual(writers, ["app/components/ThemeProviderClass.ts", "app/layout.tsx"]);
});

test("B3 applyThemeClass — 이미 그 class 만 있으면 안 쓴다 · 다르면 next-themes 순서(둘 다 떼고 붙이기) · 엉뚱한 값은 던지지 않는다", () => {
  assert.deepEqual([...THEME_CLASSES], ["light", "dark"]);
  const cases: Array<[string[], string, string, boolean]> = [
    [["h-full", "antialiased", "light"], "light", "h-full antialiased light", false],
    [["h-full", "antialiased", "dark"], "dark", "h-full antialiased dark", false],
    [["h-full", "antialiased", "light"], "dark", "h-full antialiased dark", true],
    [["h-full", "antialiased", "dark"], "light", "h-full antialiased light", true],
    [["h-full", "antialiased"], "light", "h-full antialiased light", true],
    [["h-full", "antialiased", "light", "dark"], "dark", "h-full antialiased dark", true],
    [["h-full", "antialiased", "foo"], "foo", "h-full antialiased foo", false],
  ];
  for (const [initial, theme, after, wrote] of cases) {
    const cl = fakeClassList(initial);
    assert.equal(applyThemeClass(theme, cl), wrote, `${initial.join(" ")} → ${theme}`);
    assert.equal(cl.list.join(" "), after);
    assert.equal(cl.writes, wrote ? 2 : 0, "안 쓸 때는 setAttribute 도 없다(MutationObserver · 스타일 무효화 없음)");
  }
  const junk = fakeClassList(["h-full", "light"]);
  assert.doesNotThrow(() => applyThemeClass("a b", junk));
  assert.equal(applyThemeClass("a b", junk), false);
});

/* ───────────── C. 단지 화면 면적 글자 — 경계 없이 ㎡ 글자 · 평 쿠키일 때만 청크 ───────────── */
test("C 면적 글자 — areaTextM2 는 AreaText 의 ㎡ 글자와 같다 · 평 판정은 readAreaUnitCookie 와 같다", () => {
  const bands = ["~59㎡", "60~85㎡", "85~102㎡", "102~135㎡", "135㎡~", "60㎡ 미만"];
  for (const b of bands) assert.equal(areaTextM2(null, b), areaBandLabelByUnit(b, "m2"), b);
  for (const b of bands) assert.equal(areaTextM2(84, b), areaBandLabelByUnit(b, "m2"), "band 가 있으면 band(AreaText 와 같은 우선순위)");
  for (const x of [0, 1, 39, 59, 59.4, 59.5, 84, 84.97, 114, 135, 1234, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(areaTextM2(x, null), formatAreaByUnit(x, "m2"), String(x));
    assert.equal(areaTextM2(x, ""), formatAreaByUnit(x, "m2"), `${x} · 빈 band`);
  }
  assert.equal(areaTextM2(null, null), "");
  assert.equal(areaTextM2(undefined, undefined), "");

  const g = globalThis as { document?: { cookie: string } };
  const prev = g.document;
  try {
    for (const cookie of ["", "nz_area_unit=pyeong", "a=1; nz_area_unit=pyeong", "nz_area_unit=m2", "nz_area_unit=pyeong2", "nz_area_unit=pyeongX", "x_nz_area_unit=pyeong", "nz_area_unit=PYEONG", "a=1;nz_area_unit=pyeong; b=2"]) {
      g.document = { cookie };
      assert.equal(cookieSaysPyeong(), readAreaUnitCookie() === "pyeong", cookie);
    }
  } finally {
    if (prev === undefined) delete g.document;
    else g.document = prev;
  }
});

test("C2 AreaTextLazy — ㎡ 는 경계 없이 바로 · 평 쿠키일 때만 Suspense + 따로 받는 AreaText · lib 면적 모듈은 라우트 번들 밖", () => {
  const code = strip(read("app/complex/[id]/AreaTextLazy.tsx"));
  assert.match(code, /import \{ areaTextM2, cookieSaysPyeong \} from "\.\/area-text-m2";/);
  assert.doesNotMatch(code, /lib\/prefs\/area-unit|lib\/complex\/area-band-label/, "1.7KB 를 라우트 번들에 싣지 않는다");
  assert.match(code, /const AreaText = lazy\(\(\) => import\("\.\/AreaText"\)\.then\(\(m\) => \(\{ default: m\.AreaText \}\)\)\);/);
  assert.match(code, /const \[pyeong, setPyeong\] = useState\(false\);\s*useEffect\(\(\) => \{\s*if \(cookieSaysPyeong\(\)\) setPyeong\(true\);\s*\}, \[\]\);/);
  assert.match(code, /const plain = m2 \? <>\{`\$\{props\.prefix \?\? ""\}\$\{m2\}`\}<\/> : null;\s*if \(!pyeong\) return plain;\s*return \(\s*<Suspense fallback=\{plain\}>\s*<AreaText \{\.\.\.props\} \/>\s*<\/Suspense>\s*\);/);
  const helper = strip(read("app/complex/[id]/area-text-m2.ts"));
  assert.doesNotMatch(helper, /^import /m, "의존 없음");
  /* AreaText 는 그대로 — 평 사용자는 예전 부품이 그린다 */
  assert.match(strip(read("app/complex/[id]/AreaText.tsx")), /const text = band \? areaBandLabelByUnit\(band, unit\) : unitM2 != null \? unitAreaLabel\(unitM2, unit\) : "";/);
});

test("[1105] SoftSignup 값 객체 고정 — 하이드레이션 재시작 방지", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("app/components/soft-signup/SoftSignupProvider.tsx", "utf8");
  const assert = (await import("node:assert/strict")).default;
  assert.match(src, /const contextValue = useMemo\(\(\) => \(\{ promptSignup \}\), \[promptSignup\]\);/);
  assert.match(src, /<SoftSignupContext\.Provider value=\{contextValue\}>/);
});
