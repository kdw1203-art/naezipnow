/* [1104] 속도 2차 — 첫 로드의 문서 전체 스타일 재계산 줄이기(테마 마운트 · 쿠키 배너 표식 · 입력 중 :has) · 지도 번들(tailwind-merge) ·
 *  토스트 훅 분리. 실측(1103 빌드 · 폰 390 · CPU 4배 / 데스크톱)은 각 소스 주석에 있다. .tsx 는 글자로 읽고, 인라인 스크립트는 실행해 본다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { consentBodyClasses } from "@/lib/client/shell-gates";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const SOURCES = [...walk("app"), ...walk("components"), ...walk("lib")];

/** layout.tsx 의 인라인 스크립트 상수(작은따옴표만 쓰는 한 줄 문자열)를 꺼낸다 */
function layoutScript(name: string): string {
  const m = read("app/layout.tsx").match(new RegExp(`const ${name} =\\s*"([^"\\\\]*)";`));
  assert.ok(m, name);
  return m[1]!;
}

/* ───────────── A. 테마 — 마운트 때 전환 끄기 스타일을 넣고 걷지 않는다 ───────────── */
test("A 테마 — disableTransitionOnChange 를 걷고, 끄기는 실제로 바꾸는 경로(토글 · 설정 · OS · 다른 탭)에서만", () => {
  const code = strip(read("app/components/ThemeProvider.tsx"));
  assert.doesNotMatch(code, /disableTransitionOnChange/, "마운트 때 스타일시트 넣고 빼기(문서 전체 재계산 두 번) 없음");
  /* [1105] attribute="class" → attribute={NO_THEME_ATTRIBUTE}(빈 배열) — class 는 인라인 스크립트 · ThemeClassSync 가 단다(tests/unit/perf-1105 B) */
  assert.match(code, /<NextThemeProvider attribute=\{NO_THEME_ATTRIBUTE\} defaultTheme="light" enableSystem>/, "다른 설정은 그대로");
  /* 끄기 함수는 작은 모듈에 — 토글 · 설정 화면 청크에 공급자 본체가 딸려 가지 않게 */
  const helper = strip(read("app/components/theme-transition.ts"));
  assert.doesNotMatch(helper, /from "next-themes"|from "react"/);
  /* 끄는 스타일은 next-themes 0.4 가 넣던 것과 같은 글자 */
  const css = helper.match(/const NO_TRANSITION_CSS =\s*"([^"]+)";/)?.[1];
  assert.ok(css);
  assert.ok(read("node_modules/next-themes/dist/index.mjs").includes(css!), "next-themes 와 같은 규칙");
  assert.match(helper, /export function suppressThemeTransitions\(\): void \{/);
  assert.match(helper, /void window\.getComputedStyle\(document\.body\)\.opacity;\s*style\.remove\(\);/, "새 색을 전환 없이 계산한 뒤 걷는다");
  assert.match(helper, /requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(done\)\)/, "class 교체(React 커밋 뒤 효과) 다음 프레임까지 둔다");
  assert.match(helper, /export const THEME_STORAGE_KEY = "theme";/, "next-themes 기본 storageKey");
  /* OS · 다른 탭 경로 — next-themes 리스너(일반 효과)보다 먼저 붙도록 레이아웃 효과 */
  const eff = code.slice(code.indexOf("useLayoutEffect(() => {"));
  assert.ok(code.includes("useLayoutEffect(() => {"));
  assert.match(eff, /if \(localStorage\.getItem\(THEME_STORAGE_KEY\) !== "system"\) return;/, "OS 변경은 시스템 따르기일 때만 class 가 바뀐다");
  assert.match(eff, /mq\.addEventListener\("change", onScheme\)/);
  assert.match(eff, /if \(e\.key === THEME_STORAGE_KEY\) suppressThemeTransitions\(\);/);

  const toggle = strip(read("app/components/ThemeToggle.tsx"));
  assert.match(toggle, /import \{ suppressThemeTransitions \} from "\.\/theme-transition";/);
  assert.match(toggle, /onClick=\{\(\) => \{\s*suppressThemeTransitions\(\);\s*setTheme\(isDark \? "light" : "dark"\);\s*\}\}/);
  const settings = strip(read("app/my/settings/SettingsClient.tsx"));
  assert.match(settings, /import \{ suppressThemeTransitions \} from "@\/app\/components\/theme-transition";/);
  assert.match(settings, /if \(o\.value !== theme\) suppressThemeTransitions\(\);\s*setTheme\(o\.value\);/, "같은 칸 다시 누르기는 아무것도 안 한다");

  /* 새 테마 바꾸기 경로가 생기면 여기서 걸린다 — 끄기 없이 setTheme 을 부르면 바꾸는 순간 색이 번진다 */
  const callers = SOURCES.filter((f) => /\bsetTheme\(/.test(strip(read(f)))).map((f) => f.replace(/\\/g, "/")).sort();
  assert.deepEqual(callers, ["app/components/ThemeToggle.tsx", "app/my/settings/SettingsClient.tsx"]);
});

/* ───────────── B. 쿠키 배너 body 표식 — 그리기 전 인라인 스크립트 ───────────── */
test("B 쿠키 배너 표식 — body 맨 앞 인라인 스크립트가 훅과 같은 조건 · shell-gates 와 같은 클래스로 단다", () => {
  const js = layoutScript("CONSENT_BODY_SCRIPT");
  assert.doesNotThrow(() => new Function(js));
  function run(pathname: string, stored: string | null | "throw"): string[] {
    const list: string[] = [];
    const body = { classList: { add: (...c: string[]) => { for (const x of c) if (!list.includes(x)) list.push(x); } } };
    const storage = {
      getItem: (k: string) => {
        if (stored === "throw") throw new Error("blocked");
        return k === "nz_cookie_consent" ? stored : null;
      },
    };
    new Function("localStorage", "location", "document", js)(storage, { pathname }, { body });
    return list;
  }
  /* use-cookie-consent readStored 와 같은 판정: analytics 가 불리언인 JSON 만 "결정함" */
  const decided = (v: string | null | "throw") => {
    if (v === null || v === "throw") return false;
    try {
      return typeof (JSON.parse(v) as { analytics?: unknown } | null)?.analytics === "boolean";
    } catch {
      return false;
    }
  };
  const stores: Array<string | null | "throw"> = [
    null,
    "throw",
    JSON.stringify({ analytics: true, decidedAt: "2026-11-04T00:00:00Z" }),
    JSON.stringify({ analytics: false }),
    "{}",
    "null",
    "not-json",
    JSON.stringify({ analytics: "yes" }),
  ];
  for (const path of ["/", "/map", "/map/x", "/mapping", "/subscription", "/town/강남구"]) {
    for (const s of stores) {
      assert.deepEqual(run(path, s), decided(s) ? [] : [...consentBodyClasses(path)], `${path} · ${String(s)}`);
    }
  }
  const layout = strip(read("app/layout.tsx"));
  assert.match(
    layout,
    /<body className="min-h-full flex flex-col" suppressHydrationWarning>\s*(?:\{\}\s*)*<script dangerouslySetInnerHTML=\{\{ __html: CONSENT_BODY_SCRIPT \}\} \/>\s*(?:\{\}\s*)*<a\b/,
    "body 맨 앞(document.body 가 있는 첫 자리) · 하이드레이션 전에 더한 class 는 이 요소만 경고를 끈다",
  );
  assert.match(layout, /<script dangerouslySetInnerHTML=\{\{ __html: CONSENT_SCRIPT \}\} \/>/, "head 의 data-cc 스크립트는 그대로");
  /* 배너 효과 — 결정 · 경로 이동 때의 add/remove 는 종전대로, 드문 경우(스크립트와 훅 사이 다른 탭 결정)만 decided 에서 걷는다 */
  const banner = strip(read("components/consent/cookie-consent-banner.tsx"));
  assert.match(banner, /const classes = consentBodyClasses\(pathname\);\s*document\.body\.classList\.add\(\.\.\.classes\);\s*return \(\) => document\.body\.classList\.remove\(\.\.\.classes\);/);
  assert.match(banner, /if \(!open\) \{\s*if \(decided\) document\.body\.classList\.remove\(\.\.\.consentBodyClasses\("\/"\)\);\s*return;\s*\}/);
  assert.match(banner, /\}, \[open, pathname, decided\]\);/);
  assert.deepEqual([...consentBodyClasses("/")], ["nz-consent-open", "nz-consent-pad"], "걷을 때 쓰는 전체 집합");
});

/* ───────────── C. 입력 중 표식 — body:has(…:focus-visible) 대신 html[data-nz-typing] ───────────── */
type Listener = (e?: unknown) => void;
function typingEnv(supportsHas = true) {
  const attrs = new Map<string, string>();
  const listeners = new Map<string, Listener[]>();
  const timers: Array<() => void> = [];
  const observers: Array<{ cb: Listener; observing: boolean }> = [];
  const el = (matches: boolean) => ({ matches: (s: string) => matches && s === "input:focus-visible,textarea:focus-visible" });
  const doc = {
    activeElement: el(false) as { matches: (s: string) => boolean } | null,
    documentElement: {
      setAttribute: (k: string, v: string) => attrs.set(k, v),
      removeAttribute: (k: string) => attrs.delete(k),
    },
    body: {},
    addEventListener: (t: string, fn: Listener) => listeners.set(t, [...(listeners.get(t) ?? []), fn]),
  };
  class MO {
    o: { cb: Listener; observing: boolean };
    constructor(cb: Listener) {
      this.o = { cb, observing: false };
      observers.push(this.o);
    }
    observe() { this.o.observing = true; }
    disconnect() { this.o.observing = false; }
  }
  const win = { CSS: { supports: () => supportsHas }, MutationObserver: MO };
  const fire = (t: string) => { for (const fn of listeners.get(t) ?? []) fn({}); };
  const flush = () => { while (timers.length) timers.shift()!(); };
  const js = layoutScript("TYPING_SCRIPT");
  new Function("window", "document", "CSS", "MutationObserver", "setTimeout", js)(win, doc, win.CSS, MO, (fn: () => void) => { timers.push(fn); return 0; });
  return { doc, attrs, listeners, observers, fire, flush, el };
}

test("C 입력 중 표식 — 예전 :has 와 같은 판정(지금 포커스가 input/textarea:focus-visible 인가)을 포커스 이벤트로", () => {
  const css = read("app/globals.css");
  assert.doesNotMatch(strip(css), /:has\((input|textarea):focus-visible\)/, "body 를 :has 앵커로 두는 규칙 없음");
  assert.match(css, /html\[data-nz-typing\] body \.tabbar-autohide \{\s*display: none;\s*\}/, "탭바 — 특이성 (0,2,2) 예전과 같음");
  const coarse = css.slice(css.indexOf("html[data-nz-typing] body .note-savebar") - 200, css.indexOf("html[data-nz-typing] body .note-savebar") + 140);
  assert.match(coarse, /@media \(pointer: coarse\) \{[\s\S]*html\[data-nz-typing\] body \.note-savebar,\s*html\[data-nz-typing\] body \.complex-actionbar \{\s*display: none;/, "저장 바 · 액션 바는 터치 기기에서만(종전)");
  assert.match(strip(read("app/layout.tsx")), /<script dangerouslySetInnerHTML=\{\{ __html: TYPING_SCRIPT \}\} \/>/);
  assert.ok(strip(read("app/layout.tsx")).indexOf("TYPING_SCRIPT }}") < strip(read("app/layout.tsx")).indexOf("<body"), "첫 포커스보다 먼저 — head 에서");

  const t = typingEnv();
  assert.deepEqual([...t.listeners.keys()].sort(), ["focusin", "focusout", "keydown"]);
  /* 칸에 포커스 → 켜짐 */
  t.doc.activeElement = t.el(true);
  t.fire("focusin");
  assert.ok(t.attrs.has("data-nz-typing"));
  assert.ok(t.observers[0]?.observing, "켜져 있는 동안 body 를 지켜본다(사파리는 칸이 빠질 때 focusout 이 없다)");
  /* 칸 → 칸 이동: focusout 은 다음 틱에 판정 — 그 사이 꺼지지 않는다 */
  t.doc.activeElement = null;
  t.fire("focusout");
  assert.ok(t.attrs.has("data-nz-typing"), "focusout 즉시 끄지 않는다");
  t.doc.activeElement = t.el(true);
  t.fire("focusin");
  t.flush();
  assert.ok(t.attrs.has("data-nz-typing"), "다음 칸에 포커스가 있으면 그대로");
  /* 칸을 떠남 → 꺼짐 */
  t.doc.activeElement = t.el(false);
  t.fire("focusout");
  t.flush();
  assert.ok(!t.attrs.has("data-nz-typing"));
  assert.ok(!t.observers[0]?.observing, "꺼지면 지켜보기도 끝");
  /* 마우스로 누른 체크박스(focus-visible 아님) → 키를 치면 크롬이 focus-visible 로 바꾼다 — keydown 에서 다시 판정 */
  t.doc.activeElement = t.el(false);
  t.fire("focusin");
  assert.ok(!t.attrs.has("data-nz-typing"));
  t.doc.activeElement = t.el(true);
  t.fire("keydown");
  assert.ok(t.attrs.has("data-nz-typing"));
  /* 포커스된 칸이 DOM 에서 빠짐(focusout 없음) → 지켜보던 변경 콜백이 끈다 */
  t.doc.activeElement = { matches: () => false };
  t.observers[0]!.cb();
  assert.ok(!t.attrs.has("data-nz-typing"));

  /* :has 를 모르는 브라우저 — 예전 규칙도 안 먹었으므로 아무것도 달지 않는다 */
  const old = typingEnv(false);
  assert.equal(old.listeners.size, 0);
});

/* ───────────── E. 지도 — tailwind-merge 없이 같은 class ───────────── */
test("E NaverMap — tailwind-merge(cn) 없이 잇기만 · 호출부 className 은 기본값과 겹치지 않는 것만(높이는 감싸는 상자에)", () => {
  const src = strip(read("components/map/NaverMap.tsx"));
  assert.doesNotMatch(src, /@\/lib\/utils|tailwind-merge|\bcn\(/);
  assert.match(src, /function joinClasses\(\.\.\.parts: Array<string \| false \| null \| undefined>\): string \{\s*return parts\.filter\(Boolean\)\.join\(" "\);/);
  assert.match(src, /joinClasses\(\s*!POSITION_CLASS\.test\(className\) && "relative",\s*"h-full w-full min-h-\[200px\] overflow-hidden",\s*rounded && "rounded-2xl",\s*className,\s*\)/);
  /* POSITION_CLASS 가 twMerge 가 하던 일(위치 유틸이 오면 relative 를 지움)과 같은지 */
  const re = new RegExp(src.match(/const POSITION_CLASS = \/(.+)\/;/)![1]!);
  assert.ok(re.test("absolute inset-0 z-0") && re.test("h-full fixed") && !re.test("h-full w-full") && !re.test("md:absolute-x") && !re.test(""));

  /* 모든 호출부 — 기본(relative h-full w-full min-h-[200px] overflow-hidden rounded-2xl)과 겹치면 합치기 없이는 CSS 순서로 갈린다 */
  const ALLOWED = new Set(["h-full", "w-full", "absolute", "inset-0", "z-0"]);
  const callers = SOURCES.filter((f) => /<NaverMap\b/.test(read(f)) && !f.endsWith("NaverMap.tsx") && !f.endsWith("NaverMapLazy.tsx"));
  assert.ok(callers.length >= 9, `호출부 ${callers.length}곳`);
  for (const f of callers) {
    const s = read(f);
    for (const m of s.matchAll(/<NaverMap\b([\s\S]*?)\/>/g)) {
      const cls = m[1]!.match(/\bclassName=(?:"([^"]*)"|\{`([^`]*)`\})/);
      if (!cls) continue;
      for (const tok of (cls[1] ?? cls[2] ?? "").split(/\s+/).filter(Boolean)) assert.ok(ALLOWED.has(tok), `${f}: ${tok}`);
    }
  }
  const redev = strip(read("app/redevelopment/RedevelopmentMap.tsx"));
  assert.match(redev, /<div className="h-\[440px\] md:h-\[560px\]">\s*<NaverMap[\s\S]*?className="h-full w-full"[\s\S]*?\/>\s*<\/div>/, "정비사업 지도 높이(440/560)는 감싸는 상자");
  /* tailwind-merge 는 이제 서버 컴포넌트(AutoStack)만 쓴다 — 클라이언트 번들에 다시 들어오지 않게 */
  const utilsUsers = SOURCES.filter((f) => /from "@\/lib\/utils"/.test(read(f))).map((f) => f.replace(/\\/g, "/"));
  for (const f of utilsUsers) assert.ok(!/^\s*["']use client["']/.test(read(f)), `${f} 는 클라이언트 모듈 — cn(tailwind-merge) 을 다시 싣는다`);
  for (const f of SOURCES) if (!f.replace(/\\/g, "/").endsWith("lib/utils.ts")) assert.ok(!read(f).includes('from "tailwind-merge"'), f);
});

/* ───────────── F. 토스트 — 훅만 쓰는 화면은 공급자 본체를 싣지 않는다 ───────────── */
test("F 토스트 — 컨텍스트 · 훅은 use-toast.ts, 공급자는 레이아웃만 · 예전 경로도 다시 내보낸다", () => {
  const hook = read("app/components/toast/use-toast.ts");
  assert.match(hook, /export const ToastContext = createContext<ToastContextValue \| null>\(null\);/);
  assert.match(hook, /export function useToast\(\): ToastContextValue \{\s*const ctx = useContext\(ToastContext\);\s*return ctx \?\? \{ showToast: \(\) => \{\} \};/, "공급자 밖 no-op 그대로");
  assert.match(hook, /export type ToastAction =/);
  assert.doesNotMatch(strip(hook), /IntentLink|ToastProvider|useState|setTimeout/, "본체를 끌고 오지 않는다");
  const prov = strip(read("app/components/toast/ToastProvider.tsx"));
  assert.match(prov, /import \{ ToastContext, useToast, type ToastAction \} from "\.\/use-toast";/);
  assert.match(prov, /export \{ useToast \};/);
  assert.match(prov, /export type \{ ToastAction \};/);
  assert.doesNotMatch(prov, /createContext/, "컨텍스트는 한 곳에서만 만든다(두 벌이면 공급자와 훅이 서로 못 본다)");
  /* 런타임으로 ToastProvider 모듈을 가져오는 곳은 레이아웃뿐(타입만 가져오는 import type 은 번들에 안 남는다) */
  const runtime = SOURCES.filter((f) => /^import (?!type )[^;]*from "[^"]*\/toast\/ToastProvider";/m.test(read(f))).map((f) => f.replace(/\\/g, "/"));
  assert.deepEqual(runtime, ["app/layout.tsx"]);
  assert.match(read("app/complex/[id]/hub-client.tsx"), /import \{ useToast \} from "@\/app\/components\/toast\/use-toast";/, "단지 화면(1103 실측 중복 자리)");
});
