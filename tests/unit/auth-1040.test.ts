/* [1040] 로그인·가입 기능 추가 — 순수 규칙은 실제 코드로, 화면·서버 배선은 소스 문자열로 고정한다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  capsLockOn,
  forgotHrefWithNext,
  isLoginMethod,
  loginHrefWithNext,
  rateLimitedCode,
  rateLimitedSeconds,
  resetLinkNextSuffix,
  safeNextPath,
  SIGNUP_STEPS,
  waitLabel,
} from "@/lib/auth/auth-ux";
import { loginFailHint } from "@/lib/auth/login-fail-hint";

const read = (p: string) => readFileSync(p, "utf8");

test("시도 한도 코드 — 만들고 읽기 · 초 범위", () => {
  assert.equal(rateLimitedCode(300), "rate_limited_300");
  assert.equal(rateLimitedCode(0.2), "rate_limited_1");
  assert.equal(rateLimitedCode(99_999), "rate_limited_3600");
  assert.equal(rateLimitedCode(null), "rate_limited");
  assert.equal(rateLimitedSeconds("CredentialsSignin rate_limited_287"), 287);
  assert.equal(rateLimitedSeconds("credentialssignin rate_limited"), 0);
  assert.equal(rateLimitedSeconds("CredentialsSignin no_account"), null);
  assert.equal(rateLimitedSeconds(null), null);
});

test("loginFailHint — 시도 한도가 다른 사유보다 먼저 · 예전 사유는 그대로", () => {
  assert.deepEqual(loginFailHint("CredentialsSignin rate_limited_120"), { kind: "rate_limited", seconds: 120 });
  assert.deepEqual(loginFailHint("CredentialsSignin email_not_confirmed"), { kind: "email_not_confirmed" });
  assert.deepEqual(loginFailHint("CredentialsSignin social_only_kakao"), { kind: "social", provider: "kakao" });
  assert.deepEqual(loginFailHint("CredentialsSignin no_account"), { kind: "no_account" });
  assert.deepEqual(loginFailHint("CredentialsSignin "), { kind: "bad_password" });
});

test("waitLabel — 분·초", () => {
  assert.equal(waitLabel(45), "45초");
  assert.equal(waitLabel(61), "1분 1초");
  assert.equal(waitLabel(120), "2분");
  assert.equal(waitLabel(299.2), "5분");
  assert.equal(waitLabel(-3), "0초");
});

test("capsLockOn — 지원하지 않는 환경은 false", () => {
  assert.equal(capsLockOn({ getModifierState: (k) => k === "CapsLock" }), true);
  assert.equal(capsLockOn({ getModifierState: () => false }), false);
  assert.equal(capsLockOn({}), false);
});

test("가려던 곳 — 내부 경로만 · 인증 화면 자신은 제외", () => {
  assert.equal(safeNextPath("/notes/new?from=x"), "/notes/new?from=x");
  assert.equal(safeNextPath("//evil.com"), null);
  assert.equal(safeNextPath("/\\evil.com"), null);
  assert.equal(safeNextPath("https://evil.com"), null);
  assert.equal(safeNextPath("/login?callbackUrl=/x"), null);
  assert.equal(safeNextPath("/reset-password"), null);
  assert.equal(safeNextPath("/"), null);
  assert.equal(safeNextPath(undefined), null);
  assert.equal(loginHrefWithNext("/subscription"), "/login?callbackUrl=%2Fsubscription");
  assert.equal(loginHrefWithNext(null), "/login");
  assert.equal(forgotHrefWithNext("/my/watchlist"), "/forgot-password?callbackUrl=%2Fmy%2Fwatchlist");
  assert.equal(forgotHrefWithNext("/"), "/forgot-password");
  assert.equal(resetLinkNextSuffix("/notes/new"), "&next=%2Fnotes%2Fnew");
  assert.equal(resetLinkNextSuffix("//x"), "");
});

test("가입 3단계 · 로그인 수단", () => {
  assert.deepEqual([...SIGNUP_STEPS], ["계정", "메일 인증", "관심 지역"]);
  assert.equal(isLoginMethod("kakao"), true);
  assert.equal(isLoginMethod("naver"), false);
});

test("서버 — 시도 한도는 코드로 알린다(비밀번호 오류와 구분) · 비상 토큰은 예전대로", () => {
  const auth = read("auth.ts");
  assert.match(auth, /throw new LoginRateLimitedError\(Math\.ceil\(\(AUTH_RATE_LIMIT\.windowMs \?\? 300_000\) \/ 1000\)\);/);
  const pl = read("lib/auth/password-login.ts");
  assert.match(pl, /export class LoginRateLimitedError extends CredentialsSignin/);
  assert.match(pl, /throw new LoginRateLimitedError\(rl\.retryAfterSec\);/);
  assert.match(pl, /export async function verifyCurrentPassword\(/);
});

test("로그인 화면 — 한도 대기 · Caps Lock · 최근 사용 · 로그인 상태 · 찾기 링크에 가려던 곳", () => {
  const src = read("app/login/LoginClient.tsx");
  assert.match(src, /hint\.kind === "rate_limited"/);
  assert.match(src, /disabled=\{\(busy !== null && busy !== "password"\) \|\| waitLeft > 0\}/);
  assert.match(src, /<CapsLockNote on=\{caps\} \/>/);
  assert.match(src, /lastMethod === provider && \(/);
  assert.match(src, /rememberLoginMethod\("password"\);/);
  assert.match(src, /forgetLoginMethod\(\);/);
  assert.match(src, /\{authed && !error && \(/);
  assert.equal((src.match(/href=\{forgotHref\}/g) ?? []).length, 2);
  assert.doesNotMatch(src, /forgot-password\$\{email\.includes/);
  assert.match(src, /`다시 보내기 · \$\{resendLeft\}초`/);
  assert.match(src, /에 동의하게 됩니다 · 만 14세 이상/);
});

test("비밀번호 찾기 · 재설정 — 가려던 곳과 이메일을 끝까지", () => {
  const forgot = read("app/forgot-password/page.tsx");
  assert.match(forgot, /setNext\(safeNextPath\(params\.get\("callbackUrl"\)\)\);/);
  assert.match(forgot, /\.\.\.\(next \? \{ next \} : \{\}\)/);
  assert.match(forgot, /mailboxFor\(email\)/);
  assert.equal((forgot.match(/btn-primary/g) ?? []).length, 1);
  const api = read("app/api/auth/forgot-password/route.ts");
  assert.match(api, /next = safeNextPath\(body\.next\);/);
  assert.match(api, /\$\{resetLinkNextSuffix\(next\)\}/);
  const reset = read("app/reset-password/page.tsx");
  assert.match(reset, /import \{ PASSWORD_MIN, passwordProblem, scorePassword, stashAuthEmail \} from "@\/lib\/auth\/signup-form";/);
  assert.doesNotMatch(reset, /function scorePassword\(/);
  assert.match(reset, /router\.push\(loginHrefWithNext\(next\)\)/);
  assert.match(reset, /if \(data\.email\) stashAuthEmail\(data\.email\);/);
  assert.equal((reset.match(/btn-primary/g) ?? []).length, 3);
  assert.ok(reset.includes('type="password"') && reset.includes('role="alert"'));
});

test("비밀번호 바꾸기 — 재설정과 설정 화면이 같은 길 · 변경 알림 메일", () => {
  const lib = read("lib/auth/set-password.ts");
  assert.match(lib, /export async function setAccountPassword\(/);
  assert.match(lib, /export async function sendPasswordChangedNotice\(/);
  const reset = read("app/api/auth/reset-password/route.ts");
  assert.match(reset, /await setAccountPassword\(row\.user_email, password, \{ confirmEmail: true \}\);/);
  assert.match(reset, /await sendPasswordChangedNotice\(row\.user_email, "reset"\);/);
  const me = read("app/api/me/password/route.ts");
  assert.match(me, /if \(!email\) return NextResponse\.json\(\{ error: "로그인 필요" \}, \{ status: 401 \}\);/);
  assert.match(me, /keyRateLimit\(`me-password:\$\{email\}`, \{ max: 5, windowMs: 10 \* 60_000 \}\)/);
  assert.match(me, /if \(!rl\.ok \|\| rl\.degraded\)/);
  assert.match(me, /code: "no_password"/);
  assert.match(me, /await sendPasswordChangedNotice\(email, "settings"\);/);
  assert.match(read("lib/email/templates.ts"), /export function passwordChangedEmail\(/);
  const ui = read("app/my/settings/PasswordChange.tsx");
  assert.ok(ui.includes('type="password"') && ui.includes('role="alert"'));
  assert.equal((ui.match(/btn-primary/g) ?? []).length, 1);
  assert.match(read("app/my/settings/SettingsClient.tsx"), /<PasswordChangeRow \/>/);
});

test("가입 — 3단계 띠 · 이메일 고치기 · 소셜 첫 로그인의 동의 기록", () => {
  const signup = read("app/signup/SignupClient.tsx");
  assert.match(signup, /<SignupSteps current=\{0\} className="rise-in" \/>/);
  assert.match(signup, /<SignupSteps current=\{1\} className="rise-in" \/>/);
  assert.match(signup, /이메일 고치기/);
  assert.doesNotMatch(signup, /role="progressbar"/);
  assert.match(read("app/welcome/WelcomeClient.tsx"), /<SignupSteps current=\{2\} className="rise-in" \/>/);
  const auth = read("auth.ts");
  assert.match(auth, /const created = await ensureAppUserRow\(\{ email, name \}\);/);
  assert.match(auth, /if \(created\) \{\s+const \{ recordSocialSignupConsent \}/);
  const consent = read("lib/auth/social-consent.ts");
  assert.match(consent, /if \(existing\) return false;/);
  assert.match(consent, /marketing_agreed: false,\s+location_agreed: false,/);
  assert.match(read("lib/auth/ensure-app-user.ts"), /\}\): Promise<boolean> \{/);
});
