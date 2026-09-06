import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideSessionRefresh,
  joinSupabaseAuthCookie,
  readSupabaseSessionExpiry,
  REFRESH_SKEW_SEC,
} from "../../lib/supabase/session-cookie";

function b64url(json: string): string {
  return Buffer.from(json, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const NOW = 1_800_000_000_000; // ms

test("[969 · 22] 쿠키 없음 → 갱신 안 함(게스트 왕복 0)", () => {
  const d = decideSessionRefresh([{ name: "authjs.session-token", value: "x" }], NOW);
  assert.deepEqual(d, { present: false, refresh: false, reason: "no-cookie" });
});

test("[969 · 22] base64- 접두 세션, 만료까지 충분 → 갱신 안 함", () => {
  const exp = Math.floor(NOW / 1000) + 3000;
  const value = "base64-" + b64url(JSON.stringify({ access_token: "a.b.c", expires_at: exp }));
  const d = decideSessionRefresh([{ name: "sb-abcdefgh-auth-token", value }], NOW);
  assert.equal(d.present, true);
  assert.equal(d.refresh, false);
  assert.equal(d.reason, "fresh");
});

test("[969 · 22] 청크(.0/.1) 순서가 뒤집혀 와도 이어 붙인다", () => {
  const exp = Math.floor(NOW / 1000) + 3000;
  const whole = "base64-" + b64url(JSON.stringify({ access_token: "a".repeat(200), expires_at: exp }));
  const cut = Math.floor(whole.length / 2);
  const joined = joinSupabaseAuthCookie([
    { name: "sb-ref-auth-token.1", value: whole.slice(cut) },
    { name: "other", value: "z" },
    { name: "sb-ref-auth-token.0", value: whole.slice(0, cut) },
  ]);
  assert.equal(joined, whole);
  assert.equal(readSupabaseSessionExpiry(whole), exp);
});

test("[969 · 22] 만료 임박(skew 이내)·만료 → 갱신", () => {
  const soon = Math.floor(NOW / 1000) + REFRESH_SKEW_SEC - 1;
  const v1 = "base64-" + b64url(JSON.stringify({ expires_at: soon }));
  assert.equal(decideSessionRefresh([{ name: "sb-r-auth-token", value: v1 }], NOW).reason, "expiring");
  const past = Math.floor(NOW / 1000) - 10;
  const v2 = "base64-" + b64url(JSON.stringify({ expires_at: past }));
  assert.equal(decideSessionRefresh([{ name: "sb-r-auth-token", value: v2 }], NOW).reason, "expired");
});

test("[969 · 22] 판독 불가 → 갱신(안전한 기본값)", () => {
  const d = decideSessionRefresh([{ name: "sb-r-auth-token", value: "base64-!!!notbase64" }], NOW);
  assert.equal(d.refresh, true);
  assert.equal(d.reason, "unreadable");
  const d2 = decideSessionRefresh([{ name: "sb-r-auth-token", value: "%7B%22nope%22%3Atrue%7D" }], NOW);
  assert.equal(d2.reason, "unreadable");
});

test("[969 · 22] 구형 URL 인코딩 JSON 도 읽는다", () => {
  const exp = Math.floor(NOW / 1000) + 5000;
  const value = encodeURIComponent(JSON.stringify({ expires_at: String(exp) }));
  const d = decideSessionRefresh([{ name: "sb-r-auth-token", value }], NOW);
  assert.equal(d.reason, "fresh");
});
