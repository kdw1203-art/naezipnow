/* [1027 · 제안 27·28·29·30] 운영 점검 — 오류 화면 한 번 새로고침 · 오류 기록에 화면 쪽 정보 · 가입 지표의 기계 방문 · DB 경고.
 * 순수 함수는 실제 코드를 부르고, 화면·수신부는 소스 문자열로 잠근다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { CHUNK_RELOAD_KEY_PREFIX, CLIENT_STACK_MAX, clientErrorBody, isChunkLoadFailure, scrubStack } from "../../lib/client/error-report";
import { BUILD_MARK, normalizeBuildMark } from "../../lib/monitoring/build-mark";
import { browserFamily, deviceClass } from "../../lib/client/browser-family";

const ROOT = new URL("../../", import.meta.url);
const raw = (p: string) => readFileSync(new URL(p, ROOT), "utf8");
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── 27 · 구역 오류 화면도 한 번 새로고침 ─────────────────────────────────── */

test("[1027 · 27] 청크 실패 판정 — 화면 파일을 못 받은 오류만 · 다른 오류는 새로고침하지 않는다", () => {
  assert.equal(isChunkLoadFailure("Loading chunk 1234 failed.\n(error: https://naezipnow.com/_next/static/chunks/1234.js)"), true);
  assert.equal(isChunkLoadFailure("Loading chunk app/map/page failed."), true);
  assert.equal(isChunkLoadFailure("Loading CSS chunk 77 failed."), true);
  assert.equal(isChunkLoadFailure("ChunkLoadError: something"), true);
  assert.equal(isChunkLoadFailure("boom", "ChunkLoadError"), true);
  assert.equal(isChunkLoadFailure("Failed to fetch dynamically imported module: https://x/y.js"), true);
  assert.equal(isChunkLoadFailure("error loading dynamically imported module: https://x/y.js"), true);
  assert.equal(isChunkLoadFailure("Importing a module script failed."), true);
  assert.equal(isChunkLoadFailure("Loading failed", "TypeError"), false);
  assert.equal(isChunkLoadFailure("Cannot read properties of undefined (reading 'map')"), false);
  assert.equal(isChunkLoadFailure(""), false);
  assert.equal(isChunkLoadFailure(undefined), false);
  /* 루트 오류 화면과 같은 열쇠 — 한 화면에서 세 경계가 번갈아 새로고침하지 않는다 */
  assert.equal(CHUNK_RELOAD_KEY_PREFIX, "nz:chunk-reload:");
  for (const p of ["app/error.tsx", "app/global-error.tsx"]) {
    assert.match(raw(p), /const key = "nz:chunk-reload:" \+ window\.location\.pathname;/, p);
  }
});

test("[1027 · 27] AreaError — 여덟 구역이 쓰는 공통 몸체가 한 번 새로고침한다 · 두 번째면 그대로 둔다", () => {
  const area = code("app/components/AreaError.tsx");
  assert.match(area, /useEffect\(\(\) => \{\s*reloadOnceOnChunkFailure\(error\);\s*\}, \[error\]\);/);
  const helper = code("lib/client/error-report.ts");
  assert.match(helper, /if \(sessionStorage\.getItem\(key\)\) return false;\s*sessionStorage\.setItem\(key, String\(Date\.now\(\)\)\);\s*window\.location\.reload\(\);/);
  /* 이 몸체를 쓰는 구역 오류 화면 — 제안서가 센 여덟 곳 */
  const users = ["app/map", "app/notes", "app/analysis", "app/my", "app/payment", "app/subscription", "app/quiz", "app/rent/[region]"];
  for (const dir of users) {
    assert.ok(readdirSync(new URL(dir, ROOT)).includes("error.tsx"), `${dir}/error.tsx`);
    assert.match(raw(`${dir}/error.tsx`), /AreaError/, dir);
  }
});

/* ── 28 · 오류 기록에 화면 쪽 정보 ───────────────────────────────────────── */

test("[1027 · 28] 보고 본문 — 브라우저 스택·오류 이름·빌드 표식 · 주소는 경로만(쿼리 없음) · 길이 상한", () => {
  const err = Object.assign(new TypeError("x is not a function"), { digest: "123456789" });
  err.stack = "TypeError: x is not a function\n    at Map (https://naezipnow.com/_next/static/chunks/app/map/page-1a2b.js:1:2345)";
  const body = clientErrorBody(err, "route:map", { path: "/payment/success?paymentKey=secret&orderId=o1#top", build: "ab12cd3" });
  assert.deepEqual(body, {
    message: "x is not a function",
    name: "TypeError",
    stack: err.stack,
    digest: "123456789",
    path: "/payment/success",
    scope: "route:map",
    build: "ab12cd3",
  });
  /* 긴 스택은 저장 칸 길이(4,000자)에서 자른다 · 빈 값은 null · 문구가 없으면 기본 문구 */
  const long = clientErrorBody({ message: "", stack: "s".repeat(9000) }, "global", { path: null, build: null }, "unknown global error");
  assert.equal(long.stack?.length, CLIENT_STACK_MAX);
  assert.equal(long.message, "unknown global error");
  assert.equal(long.name, null);
  assert.equal(long.path, null);
  assert.equal(long.build, null);
  assert.equal(clientErrorBody(null, "route", { path: "/map", build: "" }).message, "unknown client error");
});

test("[1027 · 28] 스택 속 주소의 쿼리는 지운다 — 줄:칸 번호는 남긴다", () => {
  assert.equal(
    scrubStack("Error: x\n    at f (https://naezipnow.com/payment/success?paymentKey=secret&orderId=o1:10:20)"),
    "Error: x\n    at f (https://naezipnow.com/payment/success:10:20)",
  );
  assert.equal(
    scrubStack("    at https://naezipnow.com/_next/static/chunks/app/map/page-1a2b.js:1:2345"),
    "    at https://naezipnow.com/_next/static/chunks/app/map/page-1a2b.js:1:2345",
  );
  assert.equal(scrubStack("at g (https://naezipnow.com/x#frag:3:4)"), "at g (https://naezipnow.com/x:3:4)");
  assert.equal(scrubStack("at h https://naezipnow.com/a?b=1"), "at h https://naezipnow.com/a");
  const body = clientErrorBody(
    { message: "m", stack: "at f (https://naezipnow.com/payment/success?paymentKey=secret:1:2)" },
    "route",
    { path: "/payment/success", build: null },
  );
  assert.ok(!String(body.stack).includes("paymentKey"));
});

test("[1027 · 28] 수신부 — 브라우저 스택을 그대로 저장(없으면 서버 스택을 넣지 않는다) · 탭 빌드와 서버 빌드를 나란히 · 도배 방지", () => {
  const route = code("app/api/monitoring/client-error/route.ts");
  assert.match(route, /err\.stack = s\(body\.stack, 4000\) \?\? undefined;/);
  assert.match(route, /if \(name\) err\.name = name;/);
  assert.match(route, /build: normalizeBuildMark\(s\(body\.build, 40\)\) \|\| null,/);
  assert.match(route, /serverBuild: BUILD_MARK \|\| null,/);
  assert.match(route, /serverDeploy: \(process\.env\.VERCEL_DEPLOYMENT_ID \?\? ""\)\.trim\(\)\.slice\(0, 64\) \|\| null,/);
  assert.match(route, /path: s\(body\.path, 256\)\?\.split\(\/\[\?#\]\/\)\[0\] \?\? null,/);
  assert.match(route, /rateLimit\(`client-error:\$\{getClientIp\(req\)\}`, \{ limit: 30, windowMs: 60_000 \}\)/);
  assert.match(route, /if \(text\.length > MAX_BODY_CHARS\) \{/);
  /* 세 오류 경계가 같은 보고 함수를 쓴다 */
  assert.match(code("app/components/AreaError.tsx"), /reportClientError\(error, `route:\$\{area\}`\);/);
  assert.match(code("app/error.tsx"), /reportClientError\(error, "route"\);/);
  assert.match(code("app/global-error.tsx"), /reportClientError\(error, "global", "unknown global error"\);/);
  /* 문서를 통째로 갈아 끼우는 화면 — 표식은 그리기 전에 읽어 둔다(effect 때는 메타가 없을 수 있다) */
  assert.match(code("app/global-error.tsx"), /useState\(\(\) => readBuildMark\(\)\);/);
  /* 탭이 받은 빌드 — 루트 레이아웃이 메타로 심는다(값이 없으면 그리지 않는다) */
  assert.match(code("app/layout.tsx"), /\{BUILD_MARK \? <meta name="nz-build" content=\{BUILD_MARK\} \/> : null\}/);
  assert.match(code("lib/client/error-report.ts"), /document\.querySelector\('meta\[name="nz-build"\]'\)\?\.getAttribute\("content"\)/);
  /* 표식은 빌드 때 한 번 — next.config 가 서버 코드에 박는다(미리 그린 HTML·요청 때 그린 HTML·수신부가 같은 값) */
  const cfg = raw("next.config.ts");
  assert.match(cfg, /const NZ_BUILD_MARK = \(process\.env\.VERCEL_GIT_COMMIT_SHA \|\| process\.env\.GITHUB_SHA \|\| ""\)\.trim\(\)\.slice\(0, 7\);/);
  assert.match(cfg, /env: \{ NZ_BUILD_MARK \},/);
  assert.match(code("lib/monitoring/build-mark.ts"), /export const BUILD_MARK: string = normalizeBuildMark\(process\.env\.NZ_BUILD_MARK\);/);
  assert.match(code("app/layout.tsx"), /import \{ BUILD_MARK \} from "@\/lib\/monitoring\/build-mark";/);
});

test("[1027 · 28] 빌드 표식 — 커밋 해시 앞 7자 · 형식이 다르면 빈 문자열(HTML 에 아무 글자나 싣지 않는다)", () => {
  assert.equal(normalizeBuildMark("AB12CD34EF567890ab12cd34ef567890ab12cd34"), "ab12cd3");
  assert.equal(normalizeBuildMark("ab12cd3"), "ab12cd3");
  assert.equal(normalizeBuildMark(" ab12cd3 "), "ab12cd3");
  assert.equal(normalizeBuildMark("not a sha"), "");
  assert.equal(normalizeBuildMark('"><script>'), "");
  assert.equal(normalizeBuildMark("abc"), "");
  assert.equal(normalizeBuildMark(""), "");
  assert.equal(normalizeBuildMark(undefined), "");
  /* 이 테스트 실행에는 빌드 때 박힌 값이 없다 */
  assert.equal(BUILD_MARK, "");
});

/* ── 29 · 가입 지표 ─────────────────────────────────────────────────────── */

test("[1027 · 29] 브라우저 계열 — 인앱·삼성·웨일·엣지를 크롬·사파리보다 먼저 본다", () => {
  const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
  assert.equal(browserFamily(chrome), "chrome");
  assert.equal(browserFamily(`${chrome} Edg/140.0.0.0`), "edge");
  assert.equal(browserFamily(`${chrome} Whale/4.30.0.0`), "whale");
  assert.equal(browserFamily("Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36"), "samsung");
  assert.equal(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.0.0"), "kakaotalk");
  assert.equal(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.3)"), "naver");
  assert.equal(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "safari");
  assert.equal(browserFamily("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1"), "chrome");
  assert.equal(browserFamily("Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"), "firefox");
  assert.equal(browserFamily(""), "other");
  assert.equal(browserFamily(null), "other");
  assert.equal(deviceClass(chrome), "desktop");
  assert.equal(deviceClass("Mozilla/5.0 (Linux; Android 14; SM-S928N) Mobile Safari/537.36"), "mobile");
});

test("[1027 · 29] 가입 1단계 — 화면이 열릴 때가 아니라 사람이 처음 움직인 뒤 · 세션당 한 번 · 브라우저 계열과 함께", () => {
  const signup = code("app/signup/SignupClient.tsx");
  assert.match(signup, /const moved = useFirstInteraction\(\);/);
  assert.match(
    signup,
    /useEffect\(\(\) => \{\s*if \(!moved\) return;\s*if \(!markOncePerSession\("nz_evt_signup_step_1"\)\) return;\s*trackStep\("signup_step_1", \{/,
  );
  assert.match(signup, /browser: browserFamily\(navigator\.userAgent\),\s*device: deviceClass\(navigator\.userAgent\),/);
  assert.match(signup, /\}, \[moved, trackStep\]\);/);
  assert.equal((signup.match(/"signup_step_1"/g) ?? []).length, 1, "찍는 곳은 한 곳");
  const gate = code("lib/client/human-gate.ts");
  /* 스크롤은 세지 않는다 — 브라우저가 스스로 일으킨 스크롤(위치 복원 · 화면 전체 캡처)도 진짜 입력으로 온다 */
  assert.match(gate, /const FIRST_INPUT_EVENTS = \["pointerdown", "keydown", "touchstart", "wheel"\] as const;/);
  assert.match(gate, /for \(const type of FIRST_INPUT_EVENTS\) \{/);
  /* 봇(UA · webdriver)은 켜지지 않고, 브라우저가 만든 진짜 입력만 센다 */
  assert.match(gate, /export function useFirstInteraction\(\): boolean \{[\s\S]*?if \(isBotBrowser\(\)\) return;[\s\S]*?if \(done \|\| !e\.isTrusted\) return;/);
  assert.match(gate, /export function markOncePerSession\(key: string\): boolean \{/);
});

/* ── 30 · DB 경고 ───────────────────────────────────────────────────────── */

test("[1027 · 30] 검색 함수 정리 — addr_dong 경로 고정 · 안 쓰는 search_complex_facets 는 로그인 없이 못 부른다 · 앱은 부르지 않는다", () => {
  const sql = raw("supabase/migrations/20261003051059_1027_search_fn_hardening.sql");
  assert.match(sql, /alter function market_agg\.addr_dong\(text\) set search_path = '';/);
  assert.match(sql, /revoke execute on function public\.search_complex_facets\(text\[\], text, text\[\], int\) from anon, authenticated;/);
  assert.doesNotMatch(sql, /drop function/i);
  for (const dir of ["lib/search", "app/api/search", "app/search"]) {
    for (const name of readdirSync(new URL(dir, ROOT), { recursive: true }) as string[]) {
      if (!/\.(ts|tsx)$/.test(name)) continue;
      assert.doesNotMatch(code(`${dir}/${name}`), /search_complex_facets/, `${dir}/${name}`);
    }
  }
});

test("[1027 · 30] 회수 문장의 public — 뒤따른 한 장이 최종 상태를 문장으로 적는다(배포 전 점검이 보는 규칙)", () => {
  const sql = raw("supabase/migrations/20261003063457_1027_search_facets_revoke_from_public.sql");
  assert.match(sql, /revoke all on function public\.search_complex_facets\(text\[\], text, text\[\], int\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.search_complex_facets\(text\[\], text, text\[\], int\) to service_role;/);
  /* 원장과 글자 단위로 같아야 하므로 끝 줄바꿈이 없다 */
  assert.equal(sql.endsWith("\n"), false);
});
