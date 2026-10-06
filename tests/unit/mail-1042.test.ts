/* [1042] 메일 발송 — SMTP 설정 해석·발신 주소·실패 사유는 실제 코드로, 발송기 배선은 소스 문자열로 고정한다.
   (실제 SMTP 왕복은 로컬 가짜 서버로 확인한다 — docs/release-1042.md) */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bareAddress, parseSmtpEnv, smtpFailureReason, smtpFromAddress } from "@/lib/email/smtp-config";

const read = (p: string) => readFileSync(p, "utf8");

test("SMTP 설정 — 호스트가 없으면 미설정", () => {
  assert.equal(parseSmtpEnv({}), null);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "  " }), null);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "smtp host" }), null);
});

test("SMTP 설정 — 포트 기본값과 접속 방식", () => {
  const a = parseSmtpEnv({ SMTP_HOST: "smtp.example.com", SMTP_USER: "u@example.com", SMTP_PASS: "p" });
  assert.deepEqual(a, { host: "smtp.example.com", port: 587, secure: false, requireTLS: true, user: "u@example.com", pass: "p" });
  const b = parseSmtpEnv({ SMTP_HOST: "smtp.example.com", SMTP_SECURE: "true" });
  assert.equal(b?.port, 465);
  assert.equal(b?.secure, true);
  assert.equal(b?.requireTLS, false);
});

test("SMTP 설정 — 깃발과 포트가 어긋나면 잘 알려진 포트는 포트를 따른다", () => {
  const a = parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "587", SMTP_SECURE: "true", SMTP_USER: "u", SMTP_PASS: "p" });
  assert.equal(a?.secure, false);
  assert.equal(a?.requireTLS, true);
  const b = parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "465", SMTP_SECURE: "false" });
  assert.equal(b?.secure, true);
  const c = parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "8025", SMTP_SECURE: "1" });
  assert.equal(c?.secure, true);
  const d = parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "8025" });
  assert.equal(d?.secure, false);
});

test("SMTP 설정 — STARTTLS 요구: 계정이 있으면 기본 요구 · 명시하면 그 값", () => {
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_USER: "u", SMTP_PASS: "p" })?.requireTLS, true);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com" })?.requireTLS, false);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_USER: "u", SMTP_PASS: "p", SMTP_REQUIRE_TLS: "false" })?.requireTLS, false);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_REQUIRE_TLS: "true" })?.requireTLS, true);
});

test("SMTP 설정 — 잘못된 포트는 기본값 · 빈 비밀번호는 없음", () => {
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "abc" })?.port, 587);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_PORT: "70000" })?.port, 587);
  assert.equal(parseSmtpEnv({ SMTP_HOST: "h.example.com", SMTP_USER: "u", SMTP_PASS: "" })?.pass, null);
});

test("발신 주소 — EMAIL_FROM 이 먼저 · 없으면 SMTP 계정 주소 · 주소 꼴이 아니면 없음", () => {
  assert.equal(smtpFromAddress({ EMAIL_FROM: "내집나우 <a@b.co>", SMTP_USER: "u@example.com" }), "내집나우 <a@b.co>");
  assert.equal(smtpFromAddress({ SMTP_USER: "u@example.com" }), "내집나우 <u@example.com>");
  assert.equal(smtpFromAddress({ SMTP_USER: "apikey" }), null);
  assert.equal(smtpFromAddress({}), null);
  assert.equal(bareAddress("내집나우 <u@example.com>"), "u@example.com");
  assert.equal(bareAddress("u@example.com"), "u@example.com");
});

test("실패 사유 — 한 줄 · 응답 원문과 비밀번호는 싣지 않는다", () => {
  const auth = smtpFailureReason({ code: "EAUTH", responseCode: 535, response: "535 5.7.8 secret-account@example.com rejected", message: "Invalid login: 535 secret" });
  assert.equal(auth, "SMTP 인증 실패(535) · 계정·비밀번호 확인");
  assert.ok(!auth.includes("secret"));
  assert.match(smtpFailureReason({ code: "EENVELOPE", responseCode: 553 }), /^SMTP 주소 거절\(553\)/);
  assert.match(smtpFailureReason({ code: "ETIMEDOUT" }), /^SMTP 서버 연결 실패\(ETIMEDOUT\)/);
  assert.match(smtpFailureReason({ code: "ESOCKET", message: "ssl3_get_record:wrong version number" }), /^SMTP 보안 연결 실패/);
  assert.match(smtpFailureReason({ responseCode: 451 }), /^SMTP 일시 거절\(451\)/);
  assert.equal(smtpFailureReason(null), "SMTP 오류(원인 미상)");
});

test("발송기 — Resend 키가 먼저, 없으면 SMTP, 둘 다 없으면 미설정", () => {
  const src = read("lib/email/send.ts");
  assert.match(src, /if \(resendApiKey\(\)\) return "resend";\s+if \(smtpConfig\(\)\) return "smtp";\s+return null;/);
  assert.match(src, /export function isEmailConfigured\(\): boolean \{\s+return mailProvider\(\) !== null;/);
  assert.match(src, /await import\("@\/lib\/email\/smtp-send"\)/);
  assert.match(src, /return \{ sent: false, reason: "미설정" \};/);
});

test("SMTP 발송 — 시간 제한 · 실패는 값으로 · 파일/URL 접근 닫음", () => {
  const src = read("lib/email/smtp-send.ts");
  assert.match(src, /connectionTimeout: 8_000/);
  assert.match(src, /greetingTimeout: 8_000/);
  assert.match(src, /socketTimeout: 15_000/);
  assert.match(src, /disableFileAccess: true/);
  assert.match(src, /return \{ sent: false, reason \};/);
  assert.ok(!/logger\.\w+\([^)]*cfg\.pass/.test(src));
});

test("두 번째 발송 길(댓글 알림·큐)도 같은 발송기 · 큐는 발송 수단이 있으면 비운다", () => {
  assert.match(read("lib/notifications/resend-send.ts"), /const r = await sendViaProvider\(input\);/);
  const drain = read("app/api/cron/notification-outbox-drain/route.ts");
  assert.match(drain, /const resendReady = isEmailConfigured\(\);/);
});

test("환영 메일 — 가입 14일 안에만(발송이 처음 켜지는 날 옛 회원에게 가지 않는다)", () => {
  const src = read("lib/auth/welcome-email.ts");
  assert.match(src, /export const WELCOME_WINDOW_DAYS = 14;/);
  assert.match(src, /\.select\("email, name, created_at"\)/);
  assert.match(src, /if \(!isRecentSignup\(\(data as \{ created_at\?: unknown \}\)\.created_at\)\) return;/);
});

test("시험 메일 — 관리자 본인 주소로만 · 한도 · 받는 주소 입력 없음", () => {
  const src = read("app/api/admin/email-test/route.ts");
  assert.match(src, /session\?\.user\?\.role !== "admin"/);
  assert.match(src, /keyRateLimit\(`admin-email-test:\$\{email\}`/);
  assert.match(src, /to: email,/);
  assert.ok(!/req\.json\(\)/.test(src));
});
