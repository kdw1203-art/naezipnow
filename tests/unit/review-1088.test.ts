/* [1088] 소유자 2026-10-23 "추가로 최적화 진행해줘" — 운영은 사용 요금 한도로 일시 정지(503) 중. 1087 다음 비용 원인을 잰 결과:
 *  JS 를 실행하는 크롤러가 화면을 열면 next/link 기본 미리 받기(화면 근처 링크 전부)가 돌아, 크롤러 한 번 방문이
 *  롱테일 ISR 렌더 수십 번이 됐다(로컬 1087 빌드 · PerplexityBot UA · 끝까지 스크롤: 단지 21건 · 동 36건 · 홈 27건 · 뉴스 글 10건).
 *  그래서: (1) 링크 미리 받기는 손이 닿을 때만(IntentLink) (2) 크롤러가 스크립트로 부른 화면 요청(미리 받기 · RSC)은 엣지에서 204
 *  (3) 닫힌 좌측 내비 패널(모든 화면 HTML 14KB)은 처음 열 때 그린다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { intentPrefetchHref } from "../../lib/client/intent-prefetch";
import { isScriptPageFetch } from "../../lib/security/bot-prefetch";
import { isBotUserAgent } from "../../lib/client/is-bot-ua";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** JSX 의 <Link …> 여는 태그들(중괄호 안의 > 는 건너뛴다) */
function linkTags(src: string): string[] {
  const out: string[] = [];
  const re = /<Link\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index + 5;
    let depth = 0;
    let quote: string | null = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
      } else if (c === '"' || (depth > 0 && (c === "'" || c === "`"))) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

/* 심사 고정 화면(요금제·결제·구독·포인트·약관) — 이번 묶음에서 손대지 않는다(링크 동작도 예전 그대로) */
const FROZEN = /^(app\/(payment|subscription|points|pro|legal|admin|auth\/toss)\/|app\/my\/(subscription|points)\/|app\/components\/UpgradePaywall\.tsx$)/;

test("IntentLink — 적지 않은 미리 받기는 끄고(prefetch={false}) 마우스·손가락·포커스가 닿을 때 한 번 'auto' 로 받는다", () => {
  const src = strip(read("app/components/IntentLink.tsx"));
  assert.match(src, /^"use client";/);
  assert.match(src, /if \(prefetch === false \|\| prefetch === true\) \{\s*return <NextLink \{\.\.\.rest\} prefetch=\{prefetch\}/, "false·true 는 예전 그대로");
  assert.match(src, /<NextLink\s+\{\.\.\.rest\}\s+prefetch=\{false\}/, "기본은 보여도 받지 않는다");
  for (const h of ["onMouseEnter", "onTouchStart", "onFocus"]) {
    assert.match(src, new RegExp(`${h}=\\{\\(e\\) => \\{\\s*${h}\\?\\.\\(e\\);\\s*warm\\(\\);`), `${h}: 부른 쪽 처리기 먼저 · 그다음 받기`);
  }
  assert.match(src, /const AUTO_PREFETCH = \{ kind: "auto" \}/);
  assert.match(src, /router\.prefetch\(href, AUTO_PREFETCH\)/);
  assert.match(src, /if \(warmed\.current\) return;/, "링크 하나에 한 번");
});

test("미리 받을 주소 — 같은 사이트 경로만", () => {
  assert.equal(intentPrefetchHref("/complex/abc"), "/complex/abc");
  assert.equal(intentPrefetchHref("/notes/new?apt=x"), "/notes/new?apt=x");
  for (const h of ["https://example.com/x", "//evil.example/x", "mailto:a@b.c", "tel:0101234", "#top", "?tab=deal", "", null, undefined, { pathname: "/x" }]) {
    assert.equal(intentPrefetchHref(h), null, String(h));
  }
});

test("링크 전수 — next/link 를 직접 쓰는 파일은 심사 고정 화면 · 모든 링크에 prefetch 를 적은 파일 · IntentLink 뿐", () => {
  const files = ["app", "components", "lib"].flatMap((d) => walk(d));
  const direct = files.filter((f) => /from "next\/link"/.test(read(f)));
  assert.ok(direct.length > 0 && direct.length < 80, `직접 쓰는 파일 ${direct.length}`);
  for (const f of direct) {
    const rel = f.split("\\").join("/");
    if (rel === "app/components/IntentLink.tsx" || FROZEN.test(rel)) continue;
    const tags = linkTags(strip(read(f)));
    /* 값이 정해진 prefetch={false}·{true} 만 — prefetch={변수}(undefined 면 보이는 대로 받는다)도 IntentLink 로 */
    const bare = tags.filter((t) => !/\bprefetch=\{(false|true)\}/.test(t));
    assert.equal(bare.length, 0, `${rel}: prefetch 를 값으로 적지 않은 <Link> ${bare.length}개 — IntentLink 로`);
  }
  const intent = files.filter((f) => read(f).includes('import Link from "@/app/components/IntentLink";'));
  assert.ok(intent.length >= 250, `IntentLink 를 쓰는 파일 ${intent.length}`);
  /* 단지 · 동 · 실거래 · 뉴스 · 홈 · 404 — 크롤러가 가장 많이 여는 화면 */
  for (const f of [
    "app/complex/[id]/page.tsx",
    "app/dong/[region]/[dong]/page.tsx",
    "app/tx/[region]/page.tsx",
    "app/town/news/[id]/page.tsx",
    "app/page.tsx",
    "app/not-found.tsx",
    "app/components/home/HomeHeroSearch.tsx",
  ]) {
    assert.match(read(f), /import Link from "@\/app\/components\/IntentLink";/, f);
  }
  /* 심사 고정 화면은 그대로 next/link */
  for (const f of ["app/subscription/page.tsx", "app/payment/success/page.tsx", "app/legal/layout.tsx"]) {
    assert.match(read(f), /import Link from "next\/link";/, f);
  }
});

test("미들웨어 — 크롤러가 스크립트로 부른 화면 요청(미리 받기 · RSC)은 204(본문 없음 · 캐시 안 함) · 문서 요청 · 사람은 그대로", () => {
  const req = (method: string, pathname: string, o: Record<string, string>) => ({ method, pathname, get: (name: string) => o[name.toLowerCase()] ?? null });
  /* 미들웨어에는 RSC · Next-Router-Prefetch 헤더가 지워져 온다 — Next-Url · Sec-Fetch-Dest 로 가른다 */
  assert.equal(isScriptPageFetch(req("GET", "/complex/x", { "next-url": "/dong/a/b", "sec-fetch-dest": "empty" })), true);
  assert.equal(isScriptPageFetch(req("GET", "/complex/x", { "sec-fetch-dest": "empty" })), true);
  assert.equal(isScriptPageFetch(req("GET", "/complex/x", { "next-url": "/" })), true);
  assert.equal(isScriptPageFetch(req("GET", "/complex/x", { "sec-fetch-dest": "document", "sec-fetch-mode": "navigate" })), false, "주소창 · 링크 열기");
  assert.equal(isScriptPageFetch(req("GET", "/complex/x", {})), false, "Sec-Fetch 를 안 보내는 크롤러의 문서 요청");
  assert.equal(isScriptPageFetch(req("POST", "/safety", { "sec-fetch-dest": "empty", "next-url": "/safety" })), false, "서버 액션");
  assert.equal(isScriptPageFetch(req("GET", "/api/complex/area", { "sec-fetch-dest": "empty" })), false, "/api 는 화면이 아니다");
  assert.equal(isScriptPageFetch(req("GET", "/_next/static/x.js", { "sec-fetch-dest": "empty" })), false);
  assert.equal(isBotUserAgent("Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), false);

  const mw = strip(read("middleware.ts"));
  assert.match(mw, /import \{ isScriptPageFetch \} from "@\/lib\/security\/bot-prefetch";/);
  const rule = mw.indexOf("isScriptPageFetch({ method: request.method, pathname: request.nextUrl.pathname, get: (name) => request.headers.get(name) }) &&\n    isBotUserAgent(request.headers.get(\"user-agent\"))");
  assert.ok(rule > 0, "규칙");
  assert.match(mw.slice(rule, rule + 700), /return new NextResponse\(null, \{ status: 204, headers: \{ "Cache-Control": "private, no-store" \} \}\);/);
  /* 세션 갱신(updateSession)보다 앞 — 막힌 요청은 아무 일도 하지 않는다 */
  assert.ok(rule < mw.indexOf("updateSession("), "세션 갱신보다 먼저");
  /* 단지 UA 표본: 문서 요청과 스크립트 fetch 를 나눠 센다 */
  assert.match(mw, /\? " fetch=1"\s*: "";/);
  assert.match(mw, /console\.info\(`\[ua-sample\] complex ua="\$\{ua\}"\$\{kind\}`\);/);
});

test("좌측 내비 — 닫힌 패널의 안쪽은 처음 열 때 그린다(지연 조각) · <nav> 껍데기 · 전환 · 손잡이는 그대로", () => {
  const src = strip(read("app/components/DesktopSideNav.tsx"));
  assert.match(src, /const \[drawn, setDrawn\] = useState\(false\);/);
  assert.match(src, /const show = \(\) => \{\s*cancelClose\(\);\s*setDrawn\(true\);\s*setOpen\(true\);\s*\};/);
  assert.match(src, /const loadGroups = \(\) => import\("\.\/DesktopSideNavGroups"\);\s*const SideNavGroups = dynamic\(loadGroups, \{ ssr: false \}\);/);
  assert.match(src, /\{drawn && <SideNavGroups pathname=\{pathname\} open=\{open\} \/>\}/);
  assert.doesNotMatch(src, /GROUPS|from "\.\/Icon"|from "\.\/nav-data"/, "묶음 표 · 아이콘은 지연 조각에만");
  /* 넓은 화면에서 마우스가 처음 움직이면 쉬는 시간에 미리 받는다 */
  assert.match(src, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(src, /window\.addEventListener\("pointermove", warm, \{ passive: true \}\);/);
  assert.match(src, /<nav\s+id="nz-sidenav-panel"/, "aria-controls 대상은 늘 있다");
  assert.match(src, /aria-controls="nz-sidenav-panel"/);
  const groups = strip(read("app/components/DesktopSideNavGroups.tsx"));
  assert.match(groups, /^"use client";/);
  assert.match(groups, /export default function DesktopSideNavGroups\(\{ pathname, open \}/);
  assert.match(groups, /tabIndex=\{open \? 0 : -1\}/);
  assert.equal((groups.match(/prefetch=\{false\}/g) ?? []).length, 2, "묶음 머리 · 하위 링크 모두 미리 받지 않는다(예전 그대로)");
});
