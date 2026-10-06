/* [1041] 비밀번호 변경 알림 문구 — 서버가 실제로 보냈을 때만 "알림 메일 발송"을 적는다.
   1040 은 발송 키가 없는 운영에서도 늘 보냈다고 적었다. 규칙은 실제 코드로, 배선은 소스 문자열로 고정한다. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { passwordChangedLine } from "@/lib/auth/auth-ux";

const read = (p: string) => readFileSync(p, "utf8");

test("변경 뒤 한 줄 — 보냈을 때만 메일을 말한다", () => {
  assert.equal(passwordChangedLine("reset", true), "3초 뒤 로그인 화면 · 변경 알림 메일 발송");
  assert.equal(passwordChangedLine("reset", false), "3초 뒤 로그인 화면");
  assert.equal(passwordChangedLine("settings", true), "변경 완료 · 알림 메일 발송");
  assert.equal(passwordChangedLine("settings", false), "변경 완료 · 즉시 적용");
});

test("변경 뒤 한 줄 — 값이 없거나 true 가 아니면 보내지 않은 것", () => {
  for (const v of [undefined, null, "true", 1, {}]) {
    assert.ok(!passwordChangedLine("reset", v).includes("메일"), String(v));
    assert.ok(!passwordChangedLine("settings", v).includes("메일"), String(v));
  }
});

test("알림 함수는 발송 여부를 돌려준다 — 미설정·실패는 false", () => {
  const src = read("lib/auth/set-password.ts");
  assert.match(src, /sendPasswordChangedNotice\([^)]*\): Promise<boolean>/);
  assert.match(src, /!isEmailConfigured\(\)\) return false;/);
  assert.match(src, /return result\.sent;/);
});

test("두 API 가 noticeSent 를 응답에 싣는다", () => {
  for (const p of ["app/api/auth/reset-password/route.ts", "app/api/me/password/route.ts"]) {
    const src = read(p);
    assert.match(src, /const noticeSent = await sendPasswordChangedNotice\(/, p);
    assert.match(src, /NextResponse\.json\(\{ ok: true,[^}]*noticeSent \}\)/, p);
  }
});

test("화면에 '알림 메일 발송' 글자가 박혀 있지 않다 — 규칙 함수로만 적는다", () => {
  for (const p of ["app/reset-password/page.tsx", "app/my/settings/PasswordChange.tsx"]) {
    const src = read(p);
    const jsx = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.ok(!jsx.includes("알림 메일 발송"), p);
    assert.match(jsx, /passwordChangedLine\("(reset|settings)", noticeSent\)/, p);
    assert.match(jsx, /setNoticeSent\(data\.noticeSent === true\)/, p);
  }
});
