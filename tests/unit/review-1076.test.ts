/* [1076] 소유자 2026-10-18 — "내집나우 접속하면 관리자페이지로 자동로그인되도록 되어 있는 거 아니지? 회원가입이 잘 보이도록 해주고
 * 자동로그인도 할 수 있도록 해줘".
 *  K1 관리자 화면은 세션 + 관리자 역할이 있어야만 — 방문만으로 열리지 않는다(app/admin/layout.tsx · 엣지 가드).
 *  K2 자동 로그인 판정(lib/auth/keep-login.ts) — 끈 사람(nz_keep=0)이 브라우저를 닫았다 열면(nz_sess 없음) 세션 종료.
 *     켠 사람(기본)은 쿠키를 심지 않는다(세션 쿠키 30일 그대로 — 로컬 실측 Expires = 로그인 + 30일).
 *  K3 미들웨어 — 문서 GET/HEAD 에서 세션 쿠키(조각 포함)·nz_keep·nz_authed 를 지우고 같은 주소로 302 · 로그인 가드보다 앞.
 *  K4 로그인 화면 — "자동 로그인" 체크(기본 켬 · 20px · 지난 선택 기억) · 로그인 직전에 쿠키 반영(비밀번호·소셜 둘 다) ·
 *     회원가입은 작은 글자 링크 → 로그인 단추와 같은 폭의 테두리 단추(채움 파랑은 하나 그대로).
 *  K5 헤더 — 회원가입 채움 단추(폰에도 · 40px) · 모바일 전체 메뉴 비회원 줄은 로그인 | 회원가입. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  KEEP_LOGIN_COOKIE,
  KEEP_LOGIN_OFF,
  SESSION_MARK_COOKIE,
  keepLoginCookieStrings,
  keepLoginDefault,
  sessionCookieNamesIn,
  shouldEndSession,
} from "../../lib/auth/keep-login.ts";

const read = (p: string) => readFileSync(p, "utf8");

test("K1 관리자 화면 — 세션 없음 → /login · 세션은 있으나 관리자 아님 → / · 자동 로그인 없음", () => {
  const layout = read("app/admin/layout.tsx");
  assert.match(layout, /const session = await safeAuth\(\);\s*if \(!session\) \{\s*redirect\("\/login\?callbackUrl=\/admin"\);\s*\}\s*if \(!canAccessAdminConsole\(session\)\) \{\s*redirect\("\/"\);/);
  /* 역할은 세션(JWT)·환경 변수 목록에서만 — 코드에 박힌 자동 로그인·기본 관리자 계정이 없다 */
  const roles = read("lib/auth/staff-roles.ts");
  assert.match(roles, /export function canAccessAdminConsole\(session: Session \| null\): boolean \{\s*return resolveStaffRole\(session\) !== null;/);
  const auth = read("auth.ts");
  assert.match(auth, /const testAccountEnabled = process\.env\.TEST_ACCOUNT_ENABLED\?\.trim\(\) === "1";/);
  assert.match(auth, /role: "user" satisfies UserRole,\s*\};\s*\},\s*\}\),\s*\]\s*: \[\]\),\s*\],\s*callbacks:/);
});

test("K2 자동 로그인 판정 — 끔 + 브라우저 다시 열림에만 종료 · 켬은 쿠키 없음", () => {
  assert.equal(shouldEndSession({ hasSession: true, keepOff: true, hasMark: false }), true);
  assert.equal(shouldEndSession({ hasSession: true, keepOff: true, hasMark: true }), false, "같은 브라우저 세션 안");
  assert.equal(shouldEndSession({ hasSession: true, keepOff: false, hasMark: false }), false, "켠 사람(기본)");
  assert.equal(shouldEndSession({ hasSession: false, keepOff: true, hasMark: false }), false, "이미 비회원");
  assert.deepEqual(
    sessionCookieNamesIn(["nz_authed", "__Secure-authjs.session-token", "__Secure-authjs.session-token.0", "authjs.csrf-token", "nz_keep"]),
    ["__Secure-authjs.session-token", "__Secure-authjs.session-token.0"],
  );
  assert.equal(keepLoginDefault("nz_authed=1; nz_keep=0; x=y"), false);
  assert.equal(keepLoginDefault("nz_authed=1; nz_keeper=0"), true);
  assert.equal(keepLoginDefault(""), true);
  const off = keepLoginCookieStrings(false, true);
  assert.equal(off.length, 2);
  assert.match(off[0], new RegExp(`^${KEEP_LOGIN_COOKIE}=${KEEP_LOGIN_OFF}; Max-Age=2592000; Path=/; SameSite=Lax; Secure$`));
  assert.match(off[1], new RegExp(`^${SESSION_MARK_COOKIE}=1; Path=/; SameSite=Lax; Secure$`), "표식은 Max-Age 없음(브라우저 세션)");
  const on = keepLoginCookieStrings(true, false);
  assert.ok(on.every((c) => c.includes("Max-Age=0") && !c.includes("Secure")));
});

test("K3 미들웨어 — 문서 GET/HEAD 에서 세션·nz_keep·nz_authed 삭제 + 같은 주소 302 · 로그인 가드보다 앞", () => {
  const m = read("middleware.ts");
  assert.match(m, /function endSessionIfBrowserClosed\(request: NextRequest\): NextResponse \| null \{\s*if \(request\.method !== "GET" && request\.method !== "HEAD"\) return null;/);
  assert.match(m, /const sessionNames = sessionCookieNamesIn\(names\);/);
  assert.match(m, /NextResponse\.redirect\(new URL\(request\.nextUrl\.pathname \+ request\.nextUrl\.search, request\.url\), 302\)/);
  assert.match(m, /redirect\.headers\.set\("Cache-Control", "no-store"\);\s*for \(const name of sessionNames\) \{/);
  assert.match(m, /secure: name\.startsWith\("__Secure-"\) \|\| !isDev, httpOnly: true, maxAge: 0/);
  assert.match(m, /redirect\.cookies\.set\(KEEP_LOGIN_COOKIE, "", \{[^}]*maxAge: 0 \}\);\s*redirect\.cookies\.set\(AUTHED_HINT_COOKIE, "", \{[^}]*maxAge: 0 \}\);/);
  const callAt = m.indexOf("const ended = endSessionIfBrowserClosed(request);");
  const guardAt = m.indexOf("needsLoginAtEdge(path) &&");
  assert.ok(callAt > 0 && guardAt > callAt, "종료 판정이 로그인 가드보다 앞");
  assert.match(m, /if \(!isApi\) \{\s*const ended = endSessionIfBrowserClosed\(request\);\s*if \(ended\) return applySecurityHeaders\(ended, request\);\s*\}/);
});

test("K4 로그인 화면 — 자동 로그인 체크(기본 켬·20px·기억) · 로그인 직전 반영 · 회원가입 단추", () => {
  const s = read("app/login/LoginClient.tsx");
  assert.match(s, /import \{ applyKeepLoginChoice, keepLoginDefault \} from "@\/lib\/auth\/keep-login";/);
  assert.match(s, /const \[keep, setKeep\] = useState\(true\);\s*useEffect\(\(\) => \{\s*setKeep\(keepLoginDefault\(document\.cookie\)\);\s*\}, \[\]\);/);
  assert.equal((s.match(/applyKeepLoginChoice\(keep\);/g) ?? []).length, 2, "비밀번호 · 소셜");
  assert.ok(s.indexOf("applyKeepLoginChoice(keep);") < s.indexOf('window.location.href = `/api/auth/toss/start'), "토스 시작 전에도");
  assert.match(s, /<input\s+type="checkbox"\s+checked=\{keep\}\s+onChange=\{\(e\) => setKeep\(e\.target\.checked\)\}\s+className="h-\[20px\] w-\[20px\] shrink-0 accent-primary"/);
  assert.match(s, /<b className="font-bold text-ink">자동 로그인<\/b> · \{keep \? "30일 유지" : "브라우저를 닫을 때 로그아웃"\}/);
  assert.match(s, /className="btn-outline flex min-h-11 items-center justify-center rounded-lg px-3 text-center t-body font-bold no-underline"\s*>\s*회원가입/);
  assert.doesNotMatch(s, /계정이 없다면\{" "\}/);
  /* 채움 파랑은 ActionButton(btn-primary) 하나 — 가입 단추는 테두리 */
  assert.equal((s.match(/btn-primary/g) ?? []).length, 0);
});

test("K5 헤더 · 모바일 메뉴 — 회원가입이 보인다", () => {
  const h = read("app/components/HeaderAuth.tsx");
  assert.match(h, /href="\/signup"\s+prefetch=\{false\}\s+className="btn-primary press inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full px-3 t-body font-bold no-underline md:min-h-9 md:px-3\.5"/);
  assert.doesNotMatch(h, /className="hidden whitespace-nowrap py-3 t-body font-bold text-text-2 transition-colors hover:text-primary md:inline"/);
  /* 폰 헤더는 회원가입 단추 하나(로그인 글자는 md+) — 검색 칸 폭을 지킨다 */
  assert.match(h, /className="-mx-2 hidden whitespace-nowrap px-2 py-3 t-body font-bold text-text-1 transition-colors hover:text-primary md:inline"\s*>\s*로그인/);
  const m = read("app/components/MobileMenu.tsx");
  assert.match(m, /\{loggedIn === false \? \(\s*<Link prefetch=\{false\} href="\/signup" className="glass flex-1 rounded-xl py-2\.5 text-center t-body font-bold text-primary">\s*회원가입/);
  assert.match(m, /<Link prefetch=\{false\} href="\/my" className="glass flex-1 rounded-xl py-2\.5 text-center t-body font-bold text-text-1">\s*마이페이지/);
});
