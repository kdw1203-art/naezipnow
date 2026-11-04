/* [1105] 비회원 애드센스 — 광고 요청 잠금(pauseAdRequests)이 비회원에게 한 번도 풀리지 않던 것.
 *  원인: getSessionLite 는 비회원(로그인 힌트 nz_authed 없음 · [1007])과 조회 실패를 둘 다 null 로 주는데, 애드센스 게이트 셋
 *  (AdSenseLoader · AdZoneUnit · AdSenseUnit)이 null 을 전부 "조회 실패 → 광고 없음"으로 읽었다. Auth.js v5 는 비로그인에 JSON null 을
 *  주므로 실은 최적화 26(2026-08-04) 부터 · 1007 부터는 요청도 없이 확정. 실측(운영 1097 · 로컬 1104 · 홈·노트·뉴스 · 폰·데스크톱 ·
 *  동의 true/false): pauseAdRequests 는 1 만 세 번 쓰이고 0 은 없음 · .ad-zone-unit 0개 — 같은 화면의 AdFreeGate 는 nz_ad_free="0"(광고 있음).
 *  의도(문서 · 주석): 비회원은 광고 대상(AdSenseLoader 머리 주석 · AdFreeGate "비회원(null)은 광고 있음" · viewer.ts signedIn:false → adFree:false ·
 *  adsense-readiness "제외 경로와 프로 이상 플랜은 전부 미노출"). 정책(누가 광고를 보는가)은 그대로다 — 유료 플랜 · 제외 경로는 종전대로. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { adSenseAdFree, adFreeForViewer, isAdFreePlan } from "../../lib/ads/ad-free";
import { hasAuthedHint } from "../../lib/auth/authed-hint";
import { isAdsExcludedPath } from "../../lib/ads/adsense-policy";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("adSenseAdFree — 비회원(null · 힌트 없음)은 광고 대상 · 힌트 있는데 null 은 모른다(광고 없음) · 플랜은 종전 기준", () => {
  assert.equal(adSenseAdFree(null, false), false, "비회원 = 광고 대상");
  assert.equal(adSenseAdFree(null, true), true, "세션 쿠키는 있는데 조회 실패 = 결제자일 수 있다 → 광고 없음");
  assert.equal(adSenseAdFree({ user: { plan: "free" } }, true), false);
  assert.equal(adSenseAdFree({ user: { plan: null } }, true), false);
  assert.equal(adSenseAdFree({ user: null }, true), false);
  assert.equal(adSenseAdFree({}, true), false);
  for (const p of ["pro", "expert", "enterprise", " PRO "]) assert.equal(adSenseAdFree({ user: { plan: p } }, true), true, p);
  assert.equal(adSenseAdFree({ user: { plan: "basic" } }, true), false);
  /* 정책 그대로 — 광고 제거 플랜 · 배너 자리의 관리자 규칙 */
  assert.equal(isAdFreePlan("pro"), true);
  assert.equal(adFreeForViewer({ plan: "enterprise", role: "admin" }), false);
  assert.equal(adFreeForViewer(null), false);
});

test("잠금 순서 재현 — 비회원은 판정 뒤 0 으로 풀린다 · 제외 경로 · 판정 전 · 유료 · 조회 실패는 1", () => {
  /* AdSenseLoader: setPaused(excludedPath || adFree !== false) — adFree 는 adSenseAdFree(getSessionLite(), readAuthedHint()) */
  const pause = (path: string, adFree: boolean | null) => (isAdsExcludedPath(path) || adFree !== false ? 1 : 0);
  const guest = adSenseAdFree(null, hasAuthedHint(""));
  for (const p of ["/", "/notes", "/town/news"]) {
    assert.equal(pause(p, null), 1, `${p} 판정 전`);
    assert.equal(pause(p, guest), 0, `${p} 비회원 판정 뒤`);
  }
  for (const p of ["/payment", "/my", "/subscription", "/pricing", "/login", "/auth/toss/callback"]) assert.equal(pause(p, guest), 1, `${p} 제외 경로`);
  assert.equal(pause("/", adSenseAdFree({ user: { plan: "pro" } }, hasAuthedHint("nz_authed=1"))), 1, "유료");
  assert.equal(pause("/", adSenseAdFree(null, hasAuthedHint("a=1; nz_authed=1"))), 1, "힌트 있는데 조회 실패");
  assert.equal(pause("/", adSenseAdFree({ user: { plan: "free" } }, true)), 0, "무료 회원");
});

test("게이트 셋 — null 을 곧바로 '광고 없음'으로 두지 않고 adSenseAdFree(…, readAuthedHint()) 로 가른다", () => {
  const files = ["app/components/AdSenseLoader.tsx", "app/components/ads/AdZoneUnit.tsx", "app/components/ads/AdSenseUnit.tsx"];
  for (const f of files) {
    const src = strip(read(f));
    assert.match(src, /import \{ adSenseAdFree \} from "@\/lib\/ads\/ad-free";/, f);
    assert.match(src, /import \{ readAuthedHint \} from "@\/lib\/auth\/authed-hint";/, f);
    assert.match(src, /setAdFree\(adSenseAdFree\((s|data), readAuthedHint\(\)\)\)/, f);
    assert.doesNotMatch(src, /if \((s|data) === null\) \{\s*(if \(alive\) )?setAdFree\(true\)/, `${f} — 옛 null → 광고 없음`);
    assert.doesNotMatch(src, /plan === "pro" \|\| plan === "expert"/, `${f} — 플랜 판정은 lib/ads/ad-free 한 곳`);
    assert.match(src, /const show = enabled && adFree === false;|setPaused\(excludedPath \|\| adFree !== false\);/, `${f} — 판정 전에는 안 띄운다`);
  }
});

test("AdSenseLoader — 제외 경로에서 판정을 비운다(로그인 뒤 돌아온 화면에서 비회원 판정으로 풀리지 않게) · 실패는 광고 없음 · 잠금 규칙 그대로", () => {
  const src = strip(read("app/components/AdSenseLoader.tsx"));
  assert.match(src, /if \(!shouldCheckPlan\) \{\s*setAdFree\(null\);\s*return;\s*\}/);
  assert.match(src, /\} catch \{\s*if \(alive\) setAdFree\(true\);\s*\}/);
  assert.match(src, /setPaused\(excludedPath \|\| adFree !== false\);/);
  assert.match(src, /if \(!client \|\| excludedPath \|\| adFree !== false\) return;\s*ensureAdSenseScript\(client\);/);
  /* 로그인 화면은 전부 제외 경로 — 비회원 → 회원 전환은 반드시 제외 경로를 지난다 */
  for (const p of ["/login", "/signup", "/auth/confirm", "/auth/toss/callback"]) assert.ok(isAdsExcludedPath(p), p);
});

test("전제 — session-lite 는 힌트가 없으면 요청 없이 null(비회원) · 배너 게이트(AdFreeGate)도 같은 구분", () => {
  const sl = strip(read("lib/client/session-lite.ts"));
  assert.match(sl, /if \(!readAuthedHint\(\)\) return Promise\.resolve\(null\);/);
  assert.match(sl, /\.then\(\(r\) => \(r\.ok \? \(r\.json\(\) as Promise<SessionLite>\) : null\)\)\s*\.catch\(\(\) => null\)/);
  const gate = strip(read("app/components/ads/AdFreeGate.tsx"));
  assert.match(gate, /if \(j === null && readAuthedHint\(\)\) return;/);
  assert.equal(hasAuthedHint(""), false);
  assert.equal(hasAuthedHint("nz_authed=1"), true);
});

test("[1105] CSP — 애드센스 부정 트래픽 점검 도메인(script · connect · frame)", () => {
  const csp = readFileSync("lib/security/content-security-policy.ts", "utf8");
  for (const name of ["googleAdsScript", "googleAdsConnect", "googleAdsFrame"]) {
    const m = new RegExp(`const ${name} =\\s*"([^"]+)"`).exec(csp);
    assert.ok(m && m[1].includes("https://*.adtrafficquality.google"), name);
  }
});

test("[1105] 숨긴 칸(폭 0)에는 <ins> 를 그리지 않는다 — 보이면 그때 그리고 한 번 push", () => {
  const helper = readFileSync("lib/ads/push-when-visible.ts", "utf8");
  assert.match(helper, /export function whenBoxVisible\(/);
  assert.match(helper, /if \(el\.offsetWidth > 0\) \{\s*onVisible\(\);/);
  assert.match(helper, /new ResizeObserver\(/);
  for (const f of ["app/components/ads/AdZoneUnit.tsx", "app/components/ads/AdSenseUnit.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /return whenBoxVisible\(boxRef\.current, \(\) => setBoxVisible\(true\)\);/, f);
    assert.match(src, /if \(!show \|\| !boxVisible \|\| pushedRef\.current\) return;/, f);
    assert.match(src, /\{boxVisible && \(\s*<ins/, f);
    assert.match(src, /<div ref=\{boxRef\} className=/, f);
  }
  const csp = readFileSync("lib/security/content-security-policy.ts", "utf8");
  assert.match(csp, /const googleAdsFrame =\s*"[^"]*https:\/\/www\.google\.com"/);
});
