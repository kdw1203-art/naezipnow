/* [1039 · 회원가입] 가입 폼 규칙 · 화면·서버 계약 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EMAIL_RE,
  emailProblem,
  emailTypoFix,
  mailboxFor,
  passwordProblem,
  scorePassword,
} from "../../lib/auth/signup-form.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("[1039] 이메일 형식 — @ 만 있는 주소는 통과하지 못한다 · 오류 문구는 사실 낱말", () => {
  for (const ok of ["a@b.co", "kim.dw+nz@naver.com", "USER@Example.KR"]) assert.ok(EMAIL_RE.test(ok.trim().toLowerCase()), ok);
  for (const bad of ["a@b", "a@", "@b.com", "a b@c.com", "a@b.c", "plain"]) assert.equal(EMAIL_RE.test(bad), false, bad);
  assert.equal(emailProblem(""), "이메일 입력");
  assert.match(emailProblem("abc@naver") ?? "", /이메일 형식 확인/);
  assert.equal(emailProblem("  Kim@Naver.com "), null);
});

test("[1039] 도메인 오타 교정 — 실재 도메인으로만 · 멀쩡한 주소는 건드리지 않는다", () => {
  assert.equal(emailTypoFix("kim@gmial.com"), "kim@gmail.com");
  assert.equal(emailTypoFix("Kim@Naver.con"), "kim@naver.com");
  assert.equal(emailTypoFix("a@hanmail.com"), "a@hanmail.net");
  assert.equal(emailTypoFix("a@daum.com"), "a@daum.net");
  assert.equal(emailTypoFix("a@gmail.com"), null);
  assert.equal(emailTypoFix("a@naver.com"), null);
  assert.equal(emailTypoFix("no-at-sign"), null);
});

test("[1039] 비밀번호 — 8자 미만은 지금 글자 수를 같이 말한다 · 강도 0~4", () => {
  assert.equal(passwordProblem(""), "비밀번호 입력");
  assert.equal(passwordProblem("abc12"), "비밀번호 8자 이상 · 지금 5자");
  assert.equal(passwordProblem("abcd1234"), null);
  assert.equal(scorePassword("abc").score, 0);
  assert.equal(scorePassword("abcdefgh").score, 1);
  assert.equal(scorePassword("Abcdefgh1!xy").score, 4);
  assert.equal(scorePassword("Abcdefgh1!xy").hint, "매우 강함");
});

test("[1039] 메일함 바로가기 — 아는 웹메일만 · 모르는 도메인은 null(로그인 단추로)", () => {
  assert.deepEqual(mailboxFor("a@naver.com"), { label: "네이버 메일", href: "https://mail.naver.com/" });
  assert.equal(mailboxFor("a@GMAIL.com")?.label, "Gmail");
  assert.equal(mailboxFor("a@hanmail.net")?.label, "다음 메일");
  assert.equal(mailboxFor("a@company.co.kr"), null);
});

test("[1039] 가입 화면 — 화면 검증(noValidate) · 칸별 오류 · 보이는 라벨 · 전체 동의 · 중복 이메일 행동 · 재발송 대기", () => {
  const src = read("app/signup/SignupClient.tsx");
  assert.match(src, /<form onSubmit=\{onSubmit\} noValidate/);
  assert.match(src, /id="main-content"/);
  assert.match(src, /className="njn-field"/);
  assert.match(src, /<label htmlFor="signup-email">이메일<\/label>/);
  assert.match(src, /aria-invalid=\{emailErr \? true : undefined\}/);
  assert.match(src, /document\.getElementById\(firstBad\)\?\.focus\(\)/);
  assert.match(src, /전체 동의/);
  assert.match(src, /이 이메일로 로그인 ›/);
  assert.match(src, /비밀번호 찾기 ›/);
  assert.match(src, /if \(!data\.resent\) \{\s*trackStep\("signup_complete"/);
  assert.match(src, /setResendWait\(RESEND_COOLDOWN_SEC\)/);
  assert.match(src, /name="website" tabIndex=\{-1\}/);
  assert.match(src, /disabled=\{busy \|\| socialBusy !== null\}/);
  assert.match(src, /소셜 가입 =/);
  /* 서버 원문(영문)은 붙이지 않는다 · 주소에 이메일을 싣지 않는다 */
  assert.match(src, /\/\[가-힣\]\/\.test\(data\.detail\)/);
  assert.doesNotMatch(src, /&email=\$\{encodeURIComponent/);
  /* 채움 파랑은 화면당 하나(허용 2 = 폼 + 인증 안내 화면) */
  assert.equal((src.match(/btn-primary/g) ?? []).length, 2);
  assert.ok(src.includes("가입하고 노트 쓰기"));
});

test("[1039] 가입 API — 인증 뒤 목적지 유지 · 봇 덫 · 형식 검사 · 원문 메시지 비노출", () => {
  const src = read("app/api/auth/register/route.ts");
  assert.match(src, /const afterVerify = safeInternalPath\(typeof b\.next === "string" \? b\.next : null, "\/"\)/);
  assert.match(src, /&callbackUrl=\$\{encodeURIComponent\(afterVerify\)\}/);
  assert.equal((src.match(/encodeURIComponent\(verifyNext\)/g) ?? []).length, 3);
  assert.match(src, /typeof b\.website === "string" && b\.website\.trim\(\) !== ""/);
  assert.match(src, /if \(!EMAIL_RE\.test\(email\)\)/);
  assert.match(src, /\.slice\(0, NAME_MAX\)/);
  assert.doesNotMatch(src, /detail: finalError\.message/);
});

test("[1039] 로그인 — 실패해도 입력 칸이 새로 만들어지지 않는다 · 비밀번호 표시 · 이메일 넘기기", () => {
  const src = read("app/login/LoginClient.tsx");
  assert.doesNotMatch(src, /key=\{error \?/);
  assert.match(src, /onAnimationEnd=\{\(\) => setShake\(false\)\}/);
  assert.match(src, /type=\{showPw \? "text" : "password"\}/);
  assert.match(src, /takeAuthEmail\(\) \?\? params\.get\("email"\)/);
  assert.match(src, /onClick=\{\(\) => stashAuthEmail\(email\)\}/);
  assert.match(read("app/forgot-password/page.tsx"), /takeAuthEmail\(\) \?\?/);
});

test("[1039] 소셜 가입 — 구글·카카오 첫 로그인에 app_users 행 · 소프트 가입 단추는 가입 화면으로 · 온보딩 관측 3종", () => {
  const auth = read("auth.ts");
  assert.match(auth, /account\?\.provider === "google" \|\| account\?\.provider === "kakao"/);
  assert.match(auth, /await ensureAppUserRow\(\{ email, name \}\)/);
  assert.match(read("app/components/soft-signup/SoftSignupProvider.tsx"), /href=\{`\/signup\?callbackUrl=\$\{encodeURIComponent\(callback\)\}`\}/);
  const w = read("app/welcome/WelcomeClient.tsx");
  for (const ev of ["welcome_view", "welcome_finish", "welcome_skip"]) assert.ok(w.includes(`eventName: "${ev}"`), ev);
  assert.match(read("app/api/platform/event/route.ts"), /isBotUserAgent\(ua\)/);
});
