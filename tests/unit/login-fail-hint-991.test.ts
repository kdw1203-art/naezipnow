import assert from "node:assert/strict";
import { test } from "node:test";
import { loginFailHint } from "../../lib/auth/login-fail-hint";

/* [991] 로그인 실패 8건이 전부 한 문구였다 — 코드마다 다른 행동으로 갈리는지 고정한다 */

test("미인증 → 인증 메일 재발송", () => {
  assert.deepEqual(loginFailHint("CredentialsSignin email_not_confirmed"), {
    kind: "email_not_confirmed",
  });
});

test("소셜 전용 계정 → 해당 버튼", () => {
  assert.deepEqual(loginFailHint("CredentialsSignin social_only_google"), {
    kind: "social",
    provider: "google",
  });
  assert.deepEqual(loginFailHint("credentialssignin SOCIAL_ONLY_KAKAO"), {
    kind: "social",
    provider: "kakao",
  });
  assert.deepEqual(loginFailHint("x social_only_toss"), { kind: "social", provider: "toss" });
});

test("모르는 소셜 이름은 소셜로 치지 않는다", () => {
  assert.deepEqual(loginFailHint("social_only_naver"), { kind: "bad_password" });
});

test("계정 없음 → 가입", () => {
  assert.deepEqual(loginFailHint("CredentialsSignin no_account"), { kind: "no_account" });
});

test("코드 없음(예전 서버·일반 오류) → 비밀번호 찾기", () => {
  assert.deepEqual(loginFailHint("CredentialsSignin "), { kind: "bad_password" });
  assert.deepEqual(loginFailHint("CallbackRouteError undefined"), { kind: "bad_password" });
});
